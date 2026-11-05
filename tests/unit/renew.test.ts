import { describe, expect, it, vi } from "vitest";
import { renewWatches } from "@/lib/cron/renew";
import { cronJobs } from "@/lib/cron/jobs";
import { handleGraphHook } from "@/lib/hooks/handle";
import { hookToken, sealForOrg } from "@/lib/secrets";
import type { Db } from "@/lib/db/types";
import { newDb, setupEnv } from "./m2-helpers";
import { readFileSync } from "node:fs";

const NOW = new Date("2026-11-05T12:00:00Z");
const H = 3600_000;

async function pushAccount(db: Db, kind: "gmail_api" | "graph", watch: { id: string | null; expiresAt: Date | null }, orgId = "org_r", id = `acc_${kind}`) {
  const { env } = await setupEnv(db, orgId);
  const a = await db.upsertAccount({ id, envId: env.id, externalId: id, email: `${id}@example.test`, provider: kind === "graph" ? "microsoft" : "google", backend: kind, state: "connected", lastError: null, nextPollAt: null, mode: "push", watch });
  await db.setCredentials({ accountId: a.id, accessTokenEnc: await sealForOrg(db, orgId, "tok"), expiresAt: new Date(NOW.getTime() + 30 * H) });
  await db.upsertOAuthClient({ id: `oc_${kind}`, envId: env.id, provider: kind === "graph" ? "microsoft" : "google", clientId: "cid", clientSecretEnc: await sealForOrg(db, orgId, "sec"), mode: "byo", pubsubTopic: "projects/p/topics/t" });
  return a;
}

describe("renew-watches", () => {
  it("is a registered cron job and in the Cloudflare JOBS list", () => {
    expect(cronJobs["renew-watches"]).toBeTypeOf("function");
    expect(cronJobs["outbox-send"]).toBeTypeOf("function");
    expect(readFileSync("infra/cron-worker/wrangler.toml", "utf8")).toMatch(/JOBS = ".*renew-watches/);
  });

  it("re-registers a Gmail watch that expires within a day and stores the provider's expiry", async () => {
    const db = newDb();
    const a = await pushAccount(db, "gmail_api", { id: null, expiresAt: new Date(NOW.getTime() + 6 * H) });
    const fresh = new Date(NOW.getTime() + 7 * 86_400_000);
    const watch = vi.fn(async () => ({ data: { historyId: "1", expiration: String(fresh.getTime()) } }));
    const r = await renewWatches({ db, now: NOW, gmail: (() => ({ users: { watch } })) as never });
    expect(r).toMatchObject({ due: 1, renewed: 1, failed: 0 });
    expect(watch).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ topicName: "projects/p/topics/t" }) }));
    expect((await db.getAccount(a.id))!.watch).toMatchObject({ expiresAt: fresh, retryAt: null });
  });

  it("leaves watches that are not near expiry, and polling accounts, alone", async () => {
    const db = newDb();
    await pushAccount(db, "gmail_api", { id: null, expiresAt: new Date(NOW.getTime() + 3 * 86_400_000) });
    const watch = vi.fn();
    expect(await renewWatches({ db, now: NOW, gmail: (() => ({ users: { watch } })) as never })).toMatchObject({ due: 0 });
    expect(watch).not.toHaveBeenCalled();
  });

  it("renews a Graph subscription in place (PATCH) and keeps its id so notifications still match", async () => {
    const db = newDb();
    const a = await pushAccount(db, "graph", { id: "sub-1", expiresAt: new Date(NOW.getTime() + 2 * H) });
    const patch = vi.fn(async (b: unknown) => ({ expirationDateTime: (b as { expirationDateTime: string }).expirationDateTime }));
    const post = vi.fn();
    const graph = () => ({ api: (p: string) => ({ patch: p === "/subscriptions/sub-1" ? patch : post, post, get: async () => ({}), delete: async () => ({}) }) });
    const r = await renewWatches({ db, now: NOW, graph: graph as never });
    expect(r.renewed).toBe(1);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    const w = (await db.getAccount(a.id))!.watch!;
    expect(w.id).toBe("sub-1");
    expect(w.expiresAt!.getTime()).toBeGreaterThan(NOW.getTime() + 60 * H);
  });

  it("recreates a Graph subscription that no longer exists and stores the NEW id, which the hook then matches", async () => {
    const db = newDb();
    const a = await pushAccount(db, "graph", { id: "gone", expiresAt: new Date(NOW.getTime() + H) });
    const notFound = Object.assign(new Error("not found"), { statusCode: 404 });
    const post = vi.fn(async () => ({ id: "sub-new", expirationDateTime: new Date(NOW.getTime() + 70 * H).toISOString() }));
    const graph = () => ({ api: (p: string) => ({ patch: async () => { throw notFound; }, post, get: async () => ({ value: [], "@odata.deltaLink": "d2" }), delete: async () => ({}), p }) });
    expect((await renewWatches({ db, now: NOW, graph: graph as never })).renewed).toBe(1);
    expect((await db.getAccount(a.id))!.watch!.id).toBe("sub-new");
    expect(await db.findAccountByWatchId("sub-new")).toMatchObject({ id: a.id });
    const env = (await db.getAccount(a.id))!.envId;
    const hit = await handleGraphHook(db, env, { url: `http://x.test/api/hooks/graph/${env}`, body: { value: [{ subscriptionId: "sub-new", clientState: hookToken(env), resource: "x", changeType: "created" }] } }, { graph: graph as never, emit: async () => {} });
    expect(hit.status).toBe(202);
  });

  it("retries a failed renewal later, then falls back to polling once the old watch has expired", async () => {
    const db = newDb();
    const a = await pushAccount(db, "gmail_api", { id: null, expiresAt: new Date(NOW.getTime() + 2 * H) });
    const gmail = (() => ({ users: { watch: async () => { throw new Error("backend error 503"); } } })) as never;
    expect(await renewWatches({ db, now: NOW, gmail })).toMatchObject({ failed: 1 });
    expect((await db.getAccount(a.id))).toMatchObject({ mode: "push", lastError: "backend error 503" });
    expect(await renewWatches({ db, now: new Date(NOW.getTime() + 60_000), gmail })).toMatchObject({ due: 0 }); // backoff
    const late = new Date(NOW.getTime() + 3 * H);
    expect(await renewWatches({ db, now: late, gmail })).toMatchObject({ results: [expect.objectContaining({ fellBackToPolling: true })] });
    expect(await db.getAccount(a.id)).toMatchObject({ mode: "polling", nextPollAt: late });
  });

  it("an authentication failure stops retries and flags the account", async () => {
    const db = newDb();
    const a = await pushAccount(db, "gmail_api", { id: null, expiresAt: new Date(NOW.getTime() + H) });
    const gmail = (() => ({ users: { watch: async () => { throw new Error("invalid_grant"); } } })) as never;
    await renewWatches({ db, now: NOW, gmail });
    expect(await db.getAccount(a.id)).toMatchObject({ state: "authenticationError" });
    expect(await renewWatches({ db, now: NOW, gmail })).toMatchObject({ due: 0 });
  });
});
