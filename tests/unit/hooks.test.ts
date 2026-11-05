import { generateKeyPairSync, createSign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleGmailHook, handleGraphHook } from "@/lib/hooks/handle";
import { validateGmailPush, validateGraphNotifications, verifyPubsubJwt } from "@/lib/hooks/validate";
import { hookToken } from "@/lib/secrets";
import { newDb, setupEnv } from "./m2-helpers";
import type { GmailLike } from "@/lib/backends/gmail";
import type { MailAccount } from "@/lib/db/types";
import { sealForOrg } from "@/lib/secrets";

const push = (email: string, historyId: string | number) => ({ message: { data: Buffer.from(JSON.stringify({ emailAddress: email, historyId })).toString("base64") } });

describe("Pub/Sub JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const SA = "push@proj.iam.gserviceaccount.com";
  const AUD = "https://x.test/api/hooks/gmail/e1";
  const mint = (over: Record<string, unknown> = {}, kid = "k1") => {
    const h = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
    const p = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: AUD, exp: 2_000_000_000, email: SA, email_verified: true, ...over })).toString("base64url");
    const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url");
    return `${h}.${p}.${sig}`;
  };
  const keys = async (kid: string) => (kid === "k1" ? (jwk as JsonWebKey) : null);
  const now = 1_900_000_000;

  it("accepts a valid token", async () => expect(await verifyPubsubJwt(mint(), { audience: AUD, serviceAccount: SA }, keys, now)).toBe(true));
  it("rejects wrong audience, service account, issuer, expiry, unknown kid, bad signature", async () => {
    const e = { audience: AUD, serviceAccount: SA };
    expect(await verifyPubsubJwt(mint({ aud: "https://evil" }), e, keys, now)).toBe(false);
    expect(await verifyPubsubJwt(mint({ email: "other@proj.iam.gserviceaccount.com" }), e, keys, now)).toBe(false);
    expect(await verifyPubsubJwt(mint({ iss: "https://evil.test" }), e, keys, now)).toBe(false);
    expect(await verifyPubsubJwt(mint({ exp: 1 }), e, keys, now)).toBe(false);
    expect(await verifyPubsubJwt(mint({}, "other"), e, keys, now)).toBe(false);
    expect(await verifyPubsubJwt(mint().replace(/.$/, "A"), e, keys, now)).toBe(false);
    expect(await verifyPubsubJwt("garbage", e, keys, now)).toBe(false);
  });

  it("is required when a service account is configured", async () => {
    const base = { envId: "e1", url: new URL(`${AUD}?token=${hookToken("e1")}`), body: push("a@b.test", 1), audience: AUD, serviceAccount: SA };
    expect(await validateGmailPush({ ...base, authorization: null }, keys)).toMatchObject({ ok: false, status: 401, error: "invalid_jwt" });
    // Valid signature but expired relative to the real clock default is exercised via verifyPubsubJwt above.
    expect((await validateGmailPush({ ...base, serviceAccount: null, authorization: null }, keys)).ok).toBe(true);
  });
});

describe("Gmail hook validation", () => {
  const ok = (envId: string) => new URL(`https://x.test/api/hooks/gmail/${envId}?token=${hookToken(envId)}`);
  it("rejects a missing or wrong token, even with a good body", async () => {
    const base = { envId: "e1", body: push("a@b.test", 1), authorization: null, audience: "a" };
    expect(await validateGmailPush({ ...base, url: new URL("https://x.test/h") })).toMatchObject({ ok: false, status: 401 });
    expect(await validateGmailPush({ ...base, url: new URL("https://x.test/h?token=nope") })).toMatchObject({ ok: false, status: 401 });
    expect(await validateGmailPush({ ...base, url: ok("e2") })).toMatchObject({ ok: false, status: 401 }); // token for another env
  });
  it("parses the Pub/Sub envelope and rejects malformed messages", async () => {
    const base = { envId: "e1", url: ok("e1"), authorization: null, audience: "a" };
    expect(await validateGmailPush({ ...base, body: push("A@B.test", 99) })).toEqual({ ok: true, value: { emailAddress: "a@b.test", historyId: "99" } });
    expect(await validateGmailPush({ ...base, body: {} })).toMatchObject({ ok: false, status: 400 });
    expect(await validateGmailPush({ ...base, body: { message: { data: "!!!" } } })).toMatchObject({ ok: false, status: 400 });
    expect(await validateGmailPush({ ...base, body: { message: { data: Buffer.from("{}").toString("base64") } } })).toMatchObject({ ok: false, status: 400 });
  });

  it("syncs the matching account from history and emits events; unknown accounts get 200", async () => {
    const db = newDb();
    const { env } = await setupEnv(db);
    const a = await db.upsertAccount({ id: "g1", envId: env.id, externalId: "g", email: "ana@gmail.com", provider: "google", backend: "gmail_api", state: "connected", lastError: null, nextPollAt: null, mode: "push" });
    await db.setCredentials({ accountId: a.id, accessTokenEnc: await sealForOrg(db, "org_1", "at"), refreshTokenEnc: await sealForOrg(db, "org_1", "rt"), expiresAt: new Date(Date.now() + 3600_000) });
    await db.setCursor({ accountId: a.id, folder: "*", historyId: "100" });
    const gmail = { users: { getProfile: async () => ({ data: { historyId: "130" } }), history: { list: vi.fn(async () => ({ data: { history: [{ messagesAdded: [{ message: { id: "m1" } }] }, { messagesDeleted: [{ message: { id: "m0" } }] }, { labelsAdded: [{ message: { id: "m2" } }] }], historyId: "120" } })) } } } as unknown as GmailLike;
    const emit = vi.fn(async (_o: string, _t: string, _d: unknown) => {});
    const req = { url: ok(env.id).toString(), authorization: null, body: push("ana@gmail.com", 120) };
    const r = await handleGmailHook(db, env.id, req, { gmail: () => gmail, emit });
    expect(r).toMatchObject({ status: 200, body: { ok: true, events: 3 } });
    expect(emit.mock.calls.map((c) => c[1])).toEqual(["messageNew", "messageDeleted", "messageMoved"]);
    expect((await db.getCursor(a.id, "*"))?.historyId).toBe("120");
    expect(await handleGmailHook(db, env.id, { ...req, body: push("nobody@gmail.com", 1) }, { gmail: () => gmail, emit })).toMatchObject({ status: 200, body: { ignored: "unknown_account" } });
    expect(await handleGmailHook(db, "missing", req, {})).toMatchObject({ status: 404 });
    expect(await handleGmailHook(db, env.id, { ...req, url: "https://x.test/h?token=bad" }, {})).toMatchObject({ status: 401 });
  });
});

describe("Graph hook validation", () => {
  it("echoes validationToken as text for the subscription handshake", async () => {
    const r = await handleGraphHook(newDb(), "e1", { url: "https://x.test/api/hooks/graph/e1?validationToken=abc%20123", body: null });
    expect(r).toMatchObject({ status: 200, text: "abc 123" });
  });
  it("drops notifications with a wrong clientState and rejects when none match", () => {
    const good = { subscriptionId: "s1", clientState: hookToken("e1") };
    expect(validateGraphNotifications("e1", { value: [good, { subscriptionId: "s2", clientState: "bad" }] })).toEqual({ ok: true, value: [good] });
    expect(validateGraphNotifications("e1", { value: [{ subscriptionId: "s2", clientState: "bad" }] })).toMatchObject({ ok: false, status: 401 });
    expect(validateGraphNotifications("e2", { value: [good] })).toMatchObject({ ok: false, status: 401 });
    expect(validateGraphNotifications("e1", {})).toMatchObject({ ok: false, status: 400 });
  });
  it("runs delta sync per subscription and flags lifecycle events for renewal", async () => {
    const db = newDb();
    const { env } = await setupEnv(db);
    const a: MailAccount = await db.upsertAccount({ id: "ms1", envId: env.id, externalId: "m", email: "bo@corp.test", provider: "microsoft", backend: "graph", state: "connected", lastError: null, nextPollAt: null, mode: "push", watch: { id: "sub-1", expiresAt: new Date(Date.now() + 86_400_000) } });
    await db.setCredentials({ accountId: a.id, accessTokenEnc: await sealForOrg(db, "org_1", "at"), refreshTokenEnc: await sealForOrg(db, "org_1", "rt"), expiresAt: new Date(Date.now() + 3600_000) });
    await db.setCursor({ accountId: a.id, folder: "*", deltaLink: "https://graph/delta?token=1" });
    const graph = { api: (path: string) => ({ get: async () => (path.includes("token=1") ? { value: [{ id: "n1" }, { id: "n2", "@removed": { reason: "deleted" } }], "@odata.deltaLink": "https://graph/delta?token=2" } : {}) }) };
    const emit = vi.fn(async (_o: string, _t: string, _d: unknown) => {});
    const body = { value: [{ subscriptionId: "sub-1", clientState: hookToken(env.id), changeType: "created" }] };
    const r = await handleGraphHook(db, env.id, { url: "https://x.test/h", body }, { graph: () => graph as never, emit });
    expect(r).toMatchObject({ status: 202, body: { events: 2 } });
    expect(emit.mock.calls.map((c) => c[1])).toEqual(["messageNew", "messageDeleted"]);
    expect((await db.getCursor(a.id, "*"))?.deltaLink).toBe("https://graph/delta?token=2");
    const life = { value: [{ subscriptionId: "sub-1", clientState: hookToken(env.id), lifecycleEvent: "reauthorizationRequired" }] };
    await handleGraphHook(db, env.id, { url: "https://x.test/h", body: life }, { graph: () => graph as never, emit });
    expect((await db.getAccount(a.id))!.watch!.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
