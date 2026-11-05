import { describe, expect, it } from "vitest";
import { newDb, setupEnv, imapAccount } from "./m2-helpers";

describe("mail store (memory driver)", () => {
  it("environments are unique per org and name", async () => {
    const db = newDb();
    const a = await db.ensureEnvironment("o1", "production");
    expect((await db.ensureEnvironment("o1", "production")).id).toBe(a.id);
    expect((await db.ensureEnvironment("o2", "production")).id).not.toBe(a.id);
    expect(await db.listEnvironments("o1")).toHaveLength(1);
  });

  it("accounts upsert on (envId, externalId); oauth clients on (envId, provider)", async () => {
    const db = newDb();
    const { env } = await setupEnv(db);
    const base = { envId: env.id, externalId: "x", email: "a@b.test", provider: "imap" as const, backend: "imap" as const, state: "syncing" as const, lastError: null, nextPollAt: null, mode: "polling" as const };
    const a1 = await db.upsertAccount({ ...base, id: "a1" });
    const a2 = await db.upsertAccount({ ...base, id: "a2", state: "connected" });
    expect(a2.id).toBe(a1.id);
    expect(await db.listAccounts(env.id)).toHaveLength(1);
    const c = { envId: env.id, provider: "google" as const, clientSecretEnc: "e", mode: "byo" as const };
    await db.upsertOAuthClient({ ...c, id: "c1", clientId: "one" });
    const c2 = await db.upsertOAuthClient({ ...c, id: "c2", clientId: "two" });
    expect(c2.id).toBe("c1");
    expect((await db.getOAuthClient(env.id, "google"))?.clientId).toBe("two");
  });

  it("deleteMailData removes everything for the org and nothing for others", async () => {
    const db = newDb();
    const s = { uidValidity: 1, uidNext: 1, uids: [], connects: 0 };
    const a = await imapAccount(db, s, "o1");
    const b = await imapAccount(db, s, "o2");
    await db.setCursor({ accountId: a.id, folder: "INBOX", uidnext: 1 });
    await db.deleteMailData("o1");
    expect(await db.getAccount(a.id)).toBeNull();
    expect(await db.getCredentials(a.id)).toBeNull();
    expect(await db.getCursor(a.id, "INBOX")).toBeNull();
    expect(await db.listEnvironments("o1")).toEqual([]);
    expect(await db.getAccount(b.id)).not.toBeNull();
    await db.deleteOrgData("o2");
    expect(await db.getAccount(b.id)).toBeNull();
  });
});
