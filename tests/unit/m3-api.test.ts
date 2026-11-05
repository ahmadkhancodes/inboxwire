import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";
import { search } from "@/lib/mailcore";
import { hasScope, parseScopes, requireScope } from "@/lib/auth/scopes";
import { GmailBackend, type GmailLike } from "@/lib/backends/gmail";
import { GraphBackend } from "@/lib/backends/graph";
import { ImapBackend } from "@/lib/backends/imap";
import { makeSmtpSend, type SmtpTransportLike } from "@/lib/backends/smtp";
import { openCursor, sealCursor } from "@/lib/v1/cursor";
import { enqueueSend, processOutbox, runDueOutbox, MAX_SEND_ATTEMPTS } from "@/lib/send/outbox";
import { buildOpenApi, operations } from "@/lib/openapi";
import { sealForOrg } from "@/lib/secrets";
import type { Db, MailAccount } from "@/lib/db/types";
import { fakeImap, newDb, setupEnv } from "./m2-helpers";

const to = [{ address: "ana@example.test" }];

describe("unified search translation per provider", () => {
  const q = 'from:ana@x.test subject:"q3 report" after:2026-10-01 has:attachment invoice';
  it("Gmail q", () => {
    expect(search.toGmail(search.parseQuery(q))).toBe('from:ana@x.test subject:"q3 report" invoice after:2026/10/01 has:attachment');
  });
  it("IMAP SEARCH criteria", () => {
    expect(search.toImap(search.parseQuery(q))).toMatchObject({ from: "ana@x.test", subject: "q3 report", body: "invoice", since: "2026-10-01", header: { "content-type": "multipart/mixed" } });
  });
  it("Graph $search for free text, $filter for structured only", () => {
    expect(search.toGraph(search.parseQuery(q)).$search).toContain("from:ana@x.test");
    expect(search.toGraph(search.parseQuery("from:ana@x.test after:2026-10-01"))).toEqual({ $filter: "from/emailAddress/address eq 'ana@x.test' and receivedDateTime ge 2026-10-01T00:00:00Z" });
  });
  it("rejects bad dates and unknown has: values", () => {
    expect(() => search.parseQuery("after:yesterday")).toThrow(/YYYY-MM-DD/);
    expect(() => search.parseQuery("has:star")).toThrow(/attachment/);
  });
  it("GmailBackend.listMessages sends the translated query", async () => {
    const list = vi.fn(async () => ({ data: { messages: [] as { id: string }[] } }));
    const g = { users: { messages: { list } } } as unknown as GmailLike;
    await new GmailBackend(g).listMessages({ q: "from:a@b.test has:attachment" });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: "from:a@b.test has:attachment" }));
  });
});

describe("cursor pagination", () => {
  const scope = { accountId: "a1", folder: "INBOX", q: "from:x" };
  it("round-trips and binds to account, folder and query", () => {
    const c = sealCursor(scope, "raw-token");
    expect(openCursor(scope, c)).toBe("raw-token");
    for (const other of [{ ...scope, accountId: "a2" }, { ...scope, folder: "Sent" }, { ...scope, q: "from:y" }]) expect(() => openCursor(other, c)).toThrow(HttpError);
  });
  it("rejects forged and malformed cursors (a Graph nextLink must never be client-supplied)", () => {
    const forged = `${Buffer.from(JSON.stringify({ a: "a1", f: "INBOX", q: "from:x", r: "https://evil.test/steal" })).toString("base64url")}.AAAA`;
    expect(() => openCursor(scope, forged)).toThrow(/invalid_cursor/);
    expect(() => openCursor(scope, "garbage")).toThrow(/invalid_cursor/);
    const g = new GraphBackend({ api: () => ({ get: async () => ({}) }) } as never);
    return expect(g.listMessages({ cursor: "https://evil.test/x" })).rejects.toThrow("invalid_cursor");
  });
  it("IMAP pages newest first with a uid cursor", async () => {
    const base = fakeImap({ uidValidity: 1, uidNext: 20, uids: [1, 2, 3, 4, 5], connects: 0 });
    const b = new ImapBackend({ host: "h", port: 993, secure: true, user: "u", pass: "p" }, (st) => {
      const c = base(st);
      c.fetch = async function* (range: string) { for (const uid of range.split(",").map(Number)) yield { uid, flags: new Set<string>(), envelope: { subject: `m${uid}`, date: new Date(0) } }; };
      return c;
    });
    const p1 = await b.listMessages({ limit: 2 });
    expect(p1.items.map((m) => m.id)).toEqual(["5", "4"]);
    expect(p1.nextCursor).toBe("4");
    const p2 = await b.listMessages({ limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((m) => m.id)).toEqual(["3", "2"]);
    expect((await b.listMessages({ limit: 2, cursor: "2" })).nextCursor).toBeUndefined();
  });
});

describe("folders and attachments", () => {
  it("Gmail labels and attachments from nested parts", async () => {
    const gmail = {
      users: {
        labels: { list: async () => ({ data: { labels: [{ id: "INBOX", name: "INBOX", type: "system" }, { id: "Label_1", name: "Clients", type: "user" }] } }) },
        messages: {
          get: async () => ({ data: { payload: { parts: [{ mimeType: "multipart/mixed", parts: [{ filename: "a.pdf", mimeType: "application/pdf", body: { attachmentId: "att1", size: 12 } }] }] } } }),
          attachments: { get: async () => ({ data: { data: Buffer.from("hello").toString("base64url") } }) },
        },
      },
    } as unknown as GmailLike;
    const b = new GmailBackend(gmail);
    expect(await b.folders()).toEqual([{ id: "INBOX", name: "INBOX", kind: "system" }, { id: "Label_1", name: "Clients", kind: "user" }]);
    expect(await b.attachments("m1")).toEqual([{ id: "att1", filename: "a.pdf", contentType: "application/pdf", size: 12, inline: false }]);
    expect(Buffer.from((await b.attachment("m1", "att1")).data).toString()).toBe("hello");
    await expect(b.attachment("m1", "nope")).rejects.toThrow("not_found");
  });
  it("Graph folders and attachment bytes", async () => {
    const api = (p: string) => ({ get: async () => (p.startsWith("/me/mailFolders") ? { value: [{ id: "f1", displayName: "Inbox", unreadItemCount: 2, totalItemCount: 9 }] } : { id: "a1", name: "x.txt", contentType: "text/plain", size: 2, contentBytes: Buffer.from("hi").toString("base64") }) });
    const b = new GraphBackend({ api } as never);
    expect(await b.folders()).toEqual([{ id: "f1", name: "Inbox", kind: "system", unread: 2, total: 9 }]);
    expect(Buffer.from((await b.attachment("m", "a1")).data).toString()).toBe("hi");
  });
});

describe("API key scopes", () => {
  it("parses metadata; keys without scopes keep full access, malformed grant nothing", () => {
    expect(parseScopes(null)).toEqual(["read", "send", "admin"]);
    expect(parseScopes({ scopes: ["read"] })).toEqual(["read"]);
    expect(parseScopes('{"scopes":["send","bogus"]}')).toEqual(["send"]);
    expect(parseScopes({ scopes: "admin" })).toEqual([]);
    expect(parseScopes("not json")).toEqual([]);
  });
  it("admin includes send includes read", () => {
    expect(hasScope(["read"], "send")).toBe(false);
    expect(hasScope(["send"], "read")).toBe(true);
    expect(hasScope(["admin"], "send")).toBe(true);
    expect(hasScope([], "read")).toBe(false);
    expect(() => requireScope(["read"], "send")).toThrow(expect.objectContaining({ status: 403, code: "insufficient_scope" }));
  });
});

describe("scoped /v1 routes", () => {
  let scopes: string[] = ["read"];
  const db = newDb();
  beforeEach(() => { scopes = ["read"]; vi.resetModules(); });
  const mockAuth = () => {
    vi.doMock("@/lib/db", () => ({ getDb: async () => db }));
    vi.doMock("@/lib/auth/session", () => ({ authApiKey: async () => ({ orgId: "org_s", keyId: "k", scopes }) }));
  };
  const req = (method: string, path: string, body?: unknown) => new Request(`http://localhost/api/v1${path}`, { method, headers: { "content-type": "application/json", "x-api-key": "k" }, body: body ? JSON.stringify(body) : undefined });

  it("a read key gets 403 on send, webhooks and connect links but can list accounts", async () => {
    mockAuth();
    const send = await import("@/app/api/v1/accounts/[id]/messages/send/route");
    const hooks = await import("@/app/api/v1/webhooks/route");
    const links = await import("@/app/api/v1/connect-links/route");
    const accounts = await import("@/app/api/v1/accounts/route");
    const ctx = { params: Promise.resolve({ id: "x" }) };
    const r = await send.POST(req("POST", "/accounts/x/messages/send", { to, text: "hi" }), ctx);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "insufficient_scope", details: { required: "send" } });
    expect((await hooks.POST(req("POST", "/webhooks", { url: "https://x.test/h" }), undefined as never)).status).toBe(403);
    expect((await links.POST(req("POST", "/connect-links", {}), undefined as never)).status).toBe(403);
    expect((await accounts.GET(req("GET", "/accounts"), undefined as never)).status).toBe(200);
  });

  it("a send key reaches the account lookup (404) but still cannot manage webhooks", async () => {
    scopes = ["send"];
    mockAuth();
    const send = await import("@/app/api/v1/accounts/[id]/messages/send/route");
    const hooks = await import("@/app/api/v1/webhooks/route");
    expect((await send.POST(req("POST", "/accounts/x/messages/send", { to, text: "hi" }), { params: Promise.resolve({ id: "x" }) })).status).toBe(404);
    expect((await hooks.GET(req("GET", "/webhooks"), undefined as never)).status).toBe(403);
  });

  it("an admin key creates a webhook that subscribes to messageNew by default and shows the secret once", async () => {
    scopes = ["admin"];
    mockAuth();
    const hooks = await import("@/app/api/v1/webhooks/route");
    const res = await hooks.POST(req("POST", "/webhooks", { url: "https://hooks.example.com/in" }), undefined as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { events: string[]; secret: string; id: string };
    expect(body.events).toEqual(["messageNew"]);
    expect(body.secret).toMatch(/^whsec_/);
    const listed = (await (await hooks.GET(req("GET", "/webhooks"), undefined as never)).json()) as { items: Record<string, unknown>[] };
    expect(listed.items[0]).not.toHaveProperty("secret");
    expect((await hooks.POST(req("POST", "/webhooks", { url: "https://hooks.example.com/in", events: ["nope"] }), undefined as never)).status).toBe(400);
    expect((await hooks.POST(req("POST", "/webhooks", { url: "http://10.0.0.1/x" }), undefined as never)).status).toBe(400);
  });
});

async function gmailAccount(db: Db, orgId = "org_o") {
  const { env } = await setupEnv(db, orgId);
  const a = await db.upsertAccount({ id: "acc_g", envId: env.id, externalId: "g1", email: "me@example.test", provider: "google", backend: "gmail_api", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
  await db.setCredentials({ accountId: a.id, accessTokenEnc: await sealForOrg(db, orgId, "tok"), refreshTokenEnc: null, expiresAt: new Date(Date.now() + 10 * 86_400_000) });
  return { account: a, env, orgId };
}
const fakeGmailSend = (impl: () => Promise<{ data: { id: string; threadId?: string } }>) => {
  const send = vi.fn(impl);
  return { send, gmail: (() => ({ users: { messages: { send, get: async () => ({ data: {} }) } } })) as never };
};

describe("outbox and Idempotency-Key", () => {
  it("a repeat with the same key returns the original item and sends once", async () => {
    const db = newDb();
    const { account, env } = await gmailAccount(db);
    const { send, gmail } = fakeGmailSend(async () => ({ data: { id: "gm1", threadId: "t1" } }));
    const emit = vi.fn(async () => {});
    const first = await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, subject: "Hi", text: "x" }, idempotencyKey: "k-1" });
    expect(first.replayed).toBe(false);
    const sent = await processOutbox(db, first.item.id, { gmail, emit });
    expect(sent).toMatchObject({ status: "sent", result: { id: "gm1", threadId: "t1" } });
    expect(sent!.payloadEnc).toBeNull();
    const again = await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, subject: "Hi", text: "x" }, idempotencyKey: "k-1" });
    expect(again.replayed).toBe(true);
    expect(again.item.id).toBe(first.item.id);
    expect(again.item).toMatchObject({ status: "sent", result: { id: "gm1" } });
    expect(await processOutbox(db, first.item.id, { gmail, emit })).toBeNull(); // already sent, nothing to claim
    expect(send).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("org_o", "messageSent", expect.objectContaining({ outboxId: first.item.id, messageId: "gm1" }), { envId: env.id });
  });

  it("same key with a different body is 422; different accounts and no key are independent", async () => {
    const db = newDb();
    const { account, env } = await gmailAccount(db);
    await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "a" }, idempotencyKey: "k" });
    await expect(enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "b" }, idempotencyKey: "k" })).rejects.toMatchObject({ status: 422, code: "idempotency_key_reused" });
    const x = await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "a" } });
    const y = await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "a" } });
    expect(x.item.id).not.toBe(y.item.id);
    const other = await enqueueSend(db, { envId: env.id, accountId: "acc_other", request: { to, text: "b" }, idempotencyKey: "k" });
    expect(other.replayed).toBe(false);
    await expect(enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "a" }, idempotencyKey: "bad key\n" })).rejects.toMatchObject({ status: 400 });
  });

  it("keeps items 7 days (expireAt) and holds scheduled sends until sendAt", async () => {
    const db = newDb();
    const { account, env } = await gmailAccount(db);
    const now = new Date("2026-11-05T10:00:00Z");
    const when = new Date(now.getTime() + 3600_000).toISOString();
    const { item } = await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "later", sendAt: when }, now });
    expect(item.expireAt.getTime() - now.getTime()).toBe(7 * 86_400_000);
    const { send, gmail } = fakeGmailSend(async () => ({ data: { id: "g" } }));
    expect(await runDueOutbox({ db, gmail, now, emit: async () => {} })).toMatchObject({ due: 0 });
    expect(await runDueOutbox({ db, gmail, now: new Date(now.getTime() + 3601_000), emit: async () => {} })).toMatchObject({ due: 1, sent: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    await expect(enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "x", sendAt: new Date(now.getTime() + 40 * 86_400_000).toISOString() }, now })).rejects.toMatchObject({ code: "send_at_too_far" });
  });

  it("retries transient failures with backoff, then fails for good and emits messageFailed", async () => {
    const db = newDb();
    const { account, env } = await gmailAccount(db);
    const { send, gmail } = fakeGmailSend(async () => { throw new Error("socket hang up"); });
    const emit = vi.fn(async () => {});
    const { item } = await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "x" } });
    let t = Date.now();
    for (let i = 1; i < MAX_SEND_ATTEMPTS; i++) {
      const r = await processOutbox(db, item.id, { gmail, emit, now: new Date(t) });
      expect(r).toMatchObject({ status: "queued", attempts: i });
      expect(r!.nextAttemptAt!.getTime()).toBeGreaterThan(t);
      expect(await processOutbox(db, item.id, { gmail, emit, now: new Date(t) })).toBeNull(); // not due again yet
      t = r!.nextAttemptAt!.getTime();
    }
    const last = await processOutbox(db, item.id, { gmail, emit, now: new Date(t) });
    expect(last).toMatchObject({ status: "failed", error: "socket hang up" });
    expect(send).toHaveBeenCalledTimes(MAX_SEND_ATTEMPTS);
    expect(emit).toHaveBeenCalledWith("org_o", "messageFailed", expect.objectContaining({ outboxId: item.id }), { envId: env.id });
  });

  it("a worker that died mid-send is picked up again after its lease; two workers cannot both claim", async () => {
    const db = newDb();
    const { account, env } = await gmailAccount(db);
    const { item } = await enqueueSend(db, { envId: env.id, accountId: account.id, request: { to, text: "x" } });
    const now = new Date();
    const [a, b] = await Promise.all([db.claimOutbox(item.id, now, 120_000), db.claimOutbox(item.id, now, 120_000)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await db.claimOutbox(item.id, new Date(now.getTime() + 60_000), 120_000)).toBeNull();
    expect(await db.claimOutbox(item.id, new Date(now.getTime() + 121_000), 120_000)).toMatchObject({ attempts: 2 });
  });
});

describe("IMAP/SMTP send through nodemailer's transport", () => {
  it("sends over SMTP with threading headers and closes the transport", async () => {
    const sent: unknown[] = [];
    let closed = 0;
    const transport: SmtpTransportLike = { sendMail: async (o) => { sent.push(o); return { messageId: "<id1@x>" }; }, close: () => { closed++; } };
    const smtp = makeSmtpSend({ host: "smtp.x.test", port: 465, secure: true, user: "u", pass: "p" }, "me@x.test", () => transport);
    const s = { uidValidity: 1, uidNext: 9, uids: [], connects: 0 };
    const factory = fakeImap(s);
    const b = new ImapBackend({ host: "h", port: 993, secure: true, user: "u", pass: "p" }, (st) => {
      const c = factory(st);
      c.fetchOne = async () => ({ uid: 4, envelope: { messageId: "<parent@x>" } });
      return c;
    }, smtp);
    const r = await b.send({ to: [{ address: "ana@x.test", name: "Ana" }], subject: "Re: hi", text: "yo", replyToMessageId: "4" });
    expect(r).toEqual({ id: "<id1@x>" });
    expect(sent[0]).toMatchObject({ from: "me@x.test", to: ['"Ana" <ana@x.test>'], inReplyTo: "<parent@x>", references: ["<parent@x>"] });
    expect(closed).toBe(1);
  });

  it("an IMAP account with stored SMTP settings sends through the outbox (no smtp_not_configured)", async () => {
    const db = newDb();
    const { env } = await setupEnv(db, "org_i");
    const a: MailAccount = await db.upsertAccount({ id: "acc_i", envId: env.id, externalId: "i1", email: "ana@example.test", provider: "imap", backend: "imap", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
    await db.setCredentials({ accountId: a.id, imapSmtpEnc: await sealForOrg(db, "org_i", JSON.stringify({ imap: { host: "h", port: 993, secure: true, user: "u", pass: "p" }, smtp: { host: "smtp.example.test", port: 587, secure: false, user: "u", pass: "p" } })) });
    const sendMail = vi.fn(async () => ({ messageId: "<m@x>" }));
    const { item } = await enqueueSend(db, { envId: env.id, accountId: a.id, request: { to, text: "hello" } });
    const r = await processOutbox(db, item.id, { imapFactory: fakeImap({ uidValidity: 1, uidNext: 1, uids: [], connects: 0 }), smtp: () => ({ sendMail, close() {} }), emit: async () => {} });
    expect(r).toMatchObject({ status: "sent", result: { id: "<m@x>" } });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAPI 3.1 from Zod", () => {
  const doc = buildOpenApi("https://api.example.test") as { openapi: string; paths: Record<string, Record<string, { operationId: string; parameters: { name: string; in: string }[]; requestBody?: { content: Record<string, { schema: Record<string, unknown> }> }; "x-required-scope": string }>>; components: { schemas: Record<string, unknown> }; webhooks: Record<string, unknown> };
  it("documents every operation with its scope and no dangling $ref", () => {
    expect(doc.openapi).toBe("3.1.0");
    for (const op of operations) expect(doc.paths[op.path]![op.method]).toMatchObject({ operationId: op.id, "x-required-scope": op.scope });
    const refs = [...JSON.stringify(doc).matchAll(/#\/components\/schemas\/(\w+)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(5);
    for (const r of refs) expect(doc.components.schemas).toHaveProperty(r);
    expect(JSON.stringify(doc)).not.toContain("#/$defs");
  });
  it("send takes Idempotency-Key; webhook create defaults to messageNew; events are listed", () => {
    const send = doc.paths["/accounts/{id}/messages/send"]!.post!;
    expect(send.parameters.map((p) => p.name)).toContain("Idempotency-Key");
    expect(JSON.stringify(doc.paths["/webhooks"]!.post!.requestBody)).toContain('"default":["messageNew"]');
    expect(Object.keys(doc.webhooks)).toContain("messageNew");
  });
  it("route files exist for every documented path", async () => {
    const { existsSync } = await import("node:fs");
    for (const op of operations) {
      const dir = `src/app/api/v1${op.path.replace("{id}", "[id]").replace("{mid}", "[mid]").replace("{aid}", "[aid]")}`;
      expect(existsSync(`${dir}/route.ts`), dir).toBe(true);
    }
  });
});
