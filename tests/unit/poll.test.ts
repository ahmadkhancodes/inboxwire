import { describe, expect, it, vi } from "vitest";
import { cronJobs } from "@/lib/cron/jobs";
import { pollDueAccounts } from "@/lib/cron/poll";
import { syncAccount } from "@/lib/backends";
import { GmailBackend, type GmailLike } from "@/lib/backends/gmail";
import { GraphBackend } from "@/lib/backends/graph";
import { ImapBackend } from "@/lib/backends/imap";
import { buildRfc822 } from "@/lib/backends/mime";
import { fakeImap, imapAccount, newDb, type FakeImapState } from "./m2-helpers";
import { readFileSync } from "node:fs";

const state = (over: Partial<FakeImapState> = {}): FakeImapState => ({ uidValidity: 7, uidNext: 10, uids: [8, 9], connects: 0, ...over });

describe("poll-imap job", () => {
  it("is registered in cron jobs and the Cloudflare worker JOBS", () => {
    expect(cronJobs["poll-imap"]).toBeTypeOf("function");
    expect(readFileSync("infra/cron-worker/wrangler.toml", "utf8")).toMatch(/JOBS = ".*poll-imap/);
  });

  it("baselines on first poll, then emits messageNew for UIDs >= uidnext and schedules the next poll", async () => {
    const db = newDb();
    const s = state();
    const a = await imapAccount(db, s);
    const emit = vi.fn(async (_o: string, _t: string, _d: unknown) => {});
    const now = new Date("2026-11-05T12:00:00Z");
    expect(await pollDueAccounts({ db, imapFactory: fakeImap(s), emit, now })).toMatchObject({ due: 1, polled: 1, failed: 0, events: 0 });
    expect(await db.getCursor(a.id, "INBOX")).toMatchObject({ uidvalidity: "7", uidnext: 10 });
    expect((await db.getAccount(a.id))!.nextPollAt!.getTime()).toBe(now.getTime() + 60_000);

    s.uids = [8, 9, 10, 11];
    s.uidNext = 12;
    const later = new Date(now.getTime() + 61_000);
    const r = await pollDueAccounts({ db, imapFactory: fakeImap(s), emit, now: later });
    expect(r.events).toBe(2);
    expect(emit.mock.calls.map((c) => [c[1], (c[2] as { messageId: string }).messageId])).toEqual([["messageNew", "10"], ["messageNew", "11"]]);
    expect(await db.getCursor(a.id, "INBOX")).toMatchObject({ uidnext: 12 });
    // Not due yet: nothing happens.
    expect(await pollDueAccounts({ db, imapFactory: fakeImap(s), emit, now: new Date(later.getTime() + 1000) })).toMatchObject({ due: 0 });
  });

  it("UIDVALIDITY change resets the baseline without events", async () => {
    const db = newDb();
    const s = state();
    const a = await imapAccount(db, s);
    await pollDueAccounts({ db, imapFactory: fakeImap(s), emit: async () => {}, now: new Date(1000) });
    s.uidValidity = 8; s.uidNext = 3; s.uids = [1, 2];
    const emit = vi.fn(async (_o: string, _t: string, _d: unknown) => {});
    await pollDueAccounts({ db, imapFactory: fakeImap(s), emit, now: new Date(200_000) });
    expect(emit).not.toHaveBeenCalled();
    expect(await db.getCursor(a.id, "INBOX")).toMatchObject({ uidvalidity: "8", uidnext: 3 });
  });

  it("a failed login stops polling (authenticationError); a connect failure retries in 5 minutes", async () => {
    const db = newDb();
    const bad = state({ failLogin: true });
    const a = await imapAccount(db, bad);
    const now = new Date(5000);
    expect(await pollDueAccounts({ db, imapFactory: fakeImap(bad), now })).toMatchObject({ failed: 1 });
    expect(await db.getAccount(a.id)).toMatchObject({ state: "authenticationError", nextPollAt: null });
    expect(await pollDueAccounts({ db, imapFactory: fakeImap(bad), now: new Date(9_999_999) })).toMatchObject({ due: 0 });

    const down = (() => ({ connect: async () => { throw new Error("ETIMEDOUT"); }, logout: async () => {} })) as never;
    const b = await imapAccount(db, state());
    await syncAccount(db, b.id, { imapFactory: down, now });
    expect(await db.getAccount(b.id)).toMatchObject({ state: "connectError", lastError: "ETIMEDOUT" });
    expect((await db.getAccount(b.id))!.nextPollAt!.getTime()).toBe(now.getTime() + 300_000);
  });

  it("shards accounts so parallel invocations never overlap, and respects the time budget and limit", async () => {
    const db = newDb();
    const s = state();
    for (let i = 0; i < 6; i++) await imapAccount(db, s);
    const seen = new Set<string>();
    for (let index = 0; index < 3; index++) {
      const touched: string[] = [];
      const factory = fakeImap(s);
      await pollDueAccounts({ db, imapFactory: factory, emit: async () => {}, shard: { index, total: 3 }, now: new Date(1000) });
      for (const a of await db.listAccounts((await db.listEnvironments("org_1"))[0]!.id)) if (a.nextPollAt!.getTime() > 1000 && !seen.has(a.id)) { seen.add(a.id); touched.push(a.id); }
    }
    expect(seen.size).toBe(6);
    const db2 = newDb();
    for (let i = 0; i < 4; i++) await imapAccount(db2, s);
    expect(await pollDueAccounts({ db: db2, imapFactory: fakeImap(s), emit: async () => {}, limit: 2, now: new Date(1000) })).toMatchObject({ due: 2, polled: 2 });
    expect(await pollDueAccounts({ db: db2, imapFactory: fakeImap(s), emit: async () => {}, budgetMs: -1, now: new Date(1000) })).toMatchObject({ polled: 0 });
  });
});

describe("backend adapters (mocked providers)", () => {
  it("IMAP: connect verifies credentials, search maps to IMAP criteria, send needs SMTP", async () => {
    const s = state();
    const b = new ImapBackend({ host: "h", port: 993, secure: true, user: "u", pass: "p" }, fakeImap(s));
    await b.connect();
    expect(s.connects).toBe(1);
    expect((await b.listMessages({ limit: 1 })).items.map((m) => m.id)).toEqual(["9"]);
    await expect(b.send({ to: [{ address: "a@b.test" }] })).rejects.toThrow("smtp_not_configured");
    expect(b.watch().mode).toBe("poll");
    await b.close();
    await expect(new ImapBackend({ host: "h", port: 1, secure: true, user: "u", pass: "p" }, fakeImap(state({ failLogin: true }))).connect()).rejects.toThrow();
  });

  it("Gmail: baseline, history mapping, expired history re-baselines, watch mode follows the topic", async () => {
    const list = vi.fn();
    const gmail = { users: { getProfile: async () => ({ data: { historyId: "500" } }), history: { list }, watch: vi.fn(async () => ({ data: {} })), stop: vi.fn(async () => ({})) } } as unknown as GmailLike;
    const b = new GmailBackend(gmail, { email: "a@gmail.com", topic: "projects/p/topics/t" });
    expect(await b.sync()).toEqual({ events: [], cursor: "500" });
    list.mockResolvedValueOnce({ data: { history: [{ messagesAdded: [{ message: { id: "1" } }] }], historyId: "510", nextPageToken: "p2" } });
    list.mockResolvedValueOnce({ data: { history: [{ labelsRemoved: [{ message: { id: "1" } }] }], historyId: "520" } });
    const r = await b.sync("500");
    expect(r.cursor).toBe("520");
    expect(r.events.map((e) => e.type)).toEqual(["messageNew", "messageMoved"]);
    list.mockRejectedValueOnce(Object.assign(new Error("gone"), { code: 404 }));
    expect(await b.sync("1")).toMatchObject({ cursor: "500", events: [{ type: "accountInitialized" }] });
    const w = b.watch();
    expect(w.mode).toBe("push");
    await w.start();
    expect(gmail.users.watch).toHaveBeenCalled();
    expect(new GmailBackend(gmail, { email: "a@gmail.com" }).watch().mode).toBe("poll");
  });

  it("Graph: delta baseline walks pages without events; watch creates a subscription with clientState", async () => {
    const pages: Record<string, unknown> = {
      "/me/mailFolders/inbox/messages/delta?$select=id": { value: [{ id: "old" }], "@odata.nextLink": "next1" },
      next1: { value: [], "@odata.deltaLink": "delta-final" },
    };
    const post = vi.fn(async () => ({ id: "sub9", expirationDateTime: new Date(Date.now() + 3600_000).toISOString() }));
    const client = { api: (p: string) => ({ get: async () => pages[p], post, patch: async () => ({}), delete: async () => ({}), header() { return this; } }) };
    const b = new GraphBackend(client as never, { notificationUrl: "https://x.test/api/hooks/graph/e1", clientState: "cs" });
    expect(await b.sync()).toEqual({ events: [], cursor: "delta-final" });
    const info = await b.watch().start();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ clientState: "cs", notificationUrl: "https://x.test/api/hooks/graph/e1" }));
    expect(info).toEqual(expect.objectContaining({ id: "sub9" }));
    expect(new GraphBackend(client as never).watch().mode).toBe("poll");
  });

  it("RFC 822 builder keeps replies threaded and encodes non-ASCII subjects", () => {
    const raw = buildRfc822("me@x.test", { to: [{ address: "a@b.test", name: "Ana" }], subject: "Grüße", text: "hi" }, { inReplyTo: "<m1@x>" });
    expect(raw).toContain("In-Reply-To: <m1@x>");
    expect(raw).toContain("References: <m1@x>");
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(raw).toContain('To: "Ana" <a@b.test>');
  });
});
