import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { deleteAccount, emailDigest, purgeCanceled } from "@/lib/accounts/deletion";
import { NONE } from "@/lib/billing/entitlement";
import type { Db, MailAccount } from "@/lib/db/types";
import { sealForOrg } from "@/lib/secrets";
import { newDb, setupEnv } from "./m2-helpers";

const NOW = new Date("2026-11-05T12:00:00Z");
const DAY = 86_400_000;

async function googleAccount(db: Db, orgId = "org_1", email = "me@example.test", id = "acc_g"): Promise<MailAccount> {
  const { env } = await setupEnv(db, orgId);
  const a = await db.upsertAccount({ id, envId: env.id, externalId: id, email, provider: "google", backend: "gmail_api", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
  await db.setCredentials({ accountId: id, accessTokenEnc: await sealForOrg(db, orgId, "access-1"), refreshTokenEnc: await sealForOrg(db, orgId, "refresh-1"), expiresAt: new Date(NOW.getTime() + 3600_000) });
  await db.setCursor({ accountId: id, folder: "INBOX", historyId: "42" });
  await db.insertOutbox({ id: `ob_${id}`, envId: env.id, accountId: id, idempotencyKey: "k", requestHash: "h", status: "queued", attempts: 0, sendAt: NOW, nextAttemptAt: NOW, payloadEnc: "x", result: null, error: null, createdAt: NOW, updatedAt: NOW, expireAt: new Date(NOW.getTime() + 7 * DAY) });
  return a;
}

describe("deleteAccount", () => {
  let db: Db;
  beforeEach(() => { db = newDb(); });

  it("revokes the Google refresh token, deletes every row and writes a deletion_record without the address", async () => {
    const a = await googleAccount(db);
    const revoked: string[] = [];
    const rec = await deleteAccount(db, a, "api", { revokeGoogle: async (t) => { revoked.push(t); return true; }, now: NOW });
    expect(revoked).toEqual(["refresh-1"]);
    expect(rec).toMatchObject({ orgId: "org_1", accountId: "acc_g", reason: "api", revocation: "revoked", deleted: { accounts: 1, credentials: 1, cursors: 1, outbox: 1 } });
    expect(rec.emailHash).toBe(emailDigest("me@example.test"));
    expect(rec.emailHash).not.toBe(createHash("sha256").update("me@example.test").digest("hex"));
    expect(JSON.stringify(rec)).not.toContain("me@example.test");
    expect(await db.getAccount("acc_g")).toBeNull();
    expect(await db.getCredentials("acc_g")).toBeNull();
    expect(await db.getCursor("acc_g", "INBOX")).toBeNull();
    expect(await db.listOutbox([a.envId], 10)).toHaveLength(0);
    expect(await db.listDeletionRecords("org_1")).toHaveLength(1);
    expect((await db.listAudit("org_1"))[0]).toMatchObject({ action: "account.deleted", target: "acc_g" });
  });

  it("still deletes our copy when the provider revoke fails, and says so", async () => {
    const a = await googleAccount(db);
    const rec = await deleteAccount(db, a, "api", { revokeGoogle: async () => { throw new Error("offline"); } });
    expect(rec.revocation).toBe("failed");
    expect(await db.getAccount("acc_g")).toBeNull();
    const b = await googleAccount(db, "org_1", "b@example.test", "acc_b");
    expect((await deleteAccount(db, b, "api", { revokeGoogle: async () => false })).revocation).toBe("failed");
  });

  it("IMAP has no token to revoke", async () => {
    const { env } = await setupEnv(db);
    const a = await db.upsertAccount({ id: "acc_i", envId: env.id, externalId: "i", email: "i@example.test", provider: "imap", backend: "imap", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
    const revokeGoogle = vi.fn(async () => true);
    const rec = await deleteAccount(db, a, "api", { revokeGoogle });
    expect(rec.revocation).toBe("not_applicable");
    expect(revokeGoogle).not.toHaveBeenCalled();
  });
});

describe("DELETE /v1/accounts/{id}", () => {
  beforeEach(() => vi.resetModules());

  it("needs the admin scope, 404s for another environment, and deletes with a record", async () => {
    const db = newDb();
    await googleAccount(db, "org_d");
    let scopes = ["read", "send"];
    vi.doMock("@/lib/db", () => ({ getDb: async () => db }));
    vi.doMock("@/lib/auth/session", () => ({ authApiKey: async () => ({ orgId: "org_d", keyId: "k", scopes }) }));
    vi.doMock("@/lib/billing/stripe", () => ({ getStripe: () => null }));
    // The route uses the default Google revoke (network); stub fetch so no request leaves the process.
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { calls.push(String(url)); return new Response("{}", { status: 200 }); });
    const route = await import("@/app/api/v1/accounts/[id]/route");
    const req = () => new Request("http://localhost/api/v1/accounts/acc_g", { method: "DELETE", headers: { "x-api-key": "k" } });
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    expect((await route.DELETE(req(), ctx("acc_g"))).status).toBe(403);
    scopes = ["admin"];
    expect((await route.DELETE(req(), ctx("nope"))).status).toBe(404);
    const ok = await route.DELETE(req(), ctx("acc_g"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ deleted: true, revocation: "revoked", rows: { accounts: 1, credentials: 1 } });
    expect(calls).toEqual(["https://oauth2.googleapis.com/revoke"]);
    expect(await db.getAccount("acc_g")).toBeNull();
    expect((await route.DELETE(req(), ctx("acc_g"))).status).toBe(404);
    vi.unstubAllGlobals();
  });
});

describe("purge 30 days after cancellation", () => {
  let db: Db;
  const canceled = (endedMs: number) => ({ ...NONE(endedMs), status: "canceled" as const, expiresAt: endedMs, trialUsed: true });
  beforeEach(() => { db = newDb(); });

  it("deletes mailboxes of orgs canceled 30+ days ago and nobody else", async () => {
    await googleAccount(db, "org_old", "a@example.test", "a1");
    await googleAccount(db, "org_new", "b@example.test", "b1");
    await googleAccount(db, "org_live", "c@example.test", "c1");
    await db.setEntitlement("org_old", canceled(NOW.getTime() - 31 * DAY));
    await db.setEntitlement("org_new", canceled(NOW.getTime() - 29 * DAY));
    await db.setEntitlement("org_live", { ...NONE(NOW.getTime()), isPaid: true, status: "active", plan: "growth" });
    const r = await purgeCanceled(db, { now: NOW, revokeGoogle: async () => true });
    expect(r).toMatchObject({ orgs: 1, accounts: 1 });
    expect(await db.getAccount("a1")).toBeNull();
    expect(await db.getAccount("b1")).not.toBeNull();
    expect(await db.getAccount("c1")).not.toBeNull();
    expect((await db.listDeletionRecords("org_old"))[0]).toMatchObject({ reason: "post_cancel_purge", revocation: "revoked" });
  });

  it("is idempotent and honours the 30 day boundary", async () => {
    await googleAccount(db, "org_x", "x@example.test", "x1");
    await db.setEntitlement("org_x", canceled(NOW.getTime() - 30 * DAY + 1000));
    expect(await purgeCanceled(db, { now: NOW, revokeGoogle: async () => true })).toMatchObject({ accounts: 0 });
    const later = new Date(NOW.getTime() + 2000);
    expect(await purgeCanceled(db, { now: later, revokeGoogle: async () => true })).toMatchObject({ accounts: 1 });
    expect(await purgeCanceled(db, { now: later, revokeGoogle: async () => true })).toMatchObject({ accounts: 0, orgs: 0 });
    expect(await db.listDeletionRecords("org_x")).toHaveLength(1);
  });
});
