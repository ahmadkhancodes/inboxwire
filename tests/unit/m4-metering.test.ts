import { beforeEach, describe, expect, it, vi } from "vitest";
import { product } from "@/config/product";
import { assertCanAddMailbox, mailboxUsage, mailboxUsageFor, syncExtraMailboxes } from "@/lib/billing/mailboxes";
import { NONE } from "@/lib/billing/entitlement";
import { currentUsage } from "@/lib/billing/usage";
import { ensureCapacity } from "@/lib/connect/complete";
import type { Db, Entitlement } from "@/lib/db/types";
import { buildOpenApi } from "@/lib/openapi";
import { newDb, setupEnv } from "./m2-helpers";

const NOW = new Date("2026-11-05T12:00:00Z");
const paid = (plan: Entitlement["plan"], extra: Partial<Entitlement> = {}): Entitlement => ({ ...NONE(NOW.getTime()), isPaid: true, status: "active", plan, interval: "month", expiresAt: NOW.getTime() + 20 * 864e5, subscriptionId: "sub_1", ...extra });

async function addAccounts(db: Db, orgId: string, n: number, envName: "production" | "development" = "production") {
  const env = await db.ensureEnvironment(orgId, envName);
  for (let i = 0; i < n; i++) {
    await db.upsertAccount({ id: `${orgId}-${envName}-${i}`, envId: env.id, externalId: `e${i}`, email: `u${i}-${envName}@example.test`, provider: "imap", backend: "imap", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
  }
}

describe("mailbox metering", () => {
  let db: Db;
  beforeEach(() => { db = newDb(); });

  it("counts every account across environments (the one number meter, API and Stripe share)", async () => {
    await addAccounts(db, "org_1", 2);
    await addAccounts(db, "org_1", 1, "development");
    await addAccounts(db, "org_2", 5);
    expect((await mailboxUsage(db, "org_1", NOW)).used).toBe(3);
    const [m] = await currentUsage(db, "org_1", ["mailboxes"], NOW);
    expect(m).toMatchObject({ meter: "mailboxes", used: 3, limit: 3, level: "at" });
  });

  it("Developer is a hard cap: the 4th mailbox is refused with 402 mailbox_limit", async () => {
    await addAccounts(db, "org_1", 3);
    const u = await mailboxUsage(db, "org_1", NOW);
    expect(u).toMatchObject({ mode: "hard_cap", included: 3, canAdd: false, extra: 0 });
    await expect(assertCanAddMailbox(db, "org_1", NOW)).rejects.toMatchObject({ status: 402, code: "mailbox_limit", details: { limit: 3, used: 3 } });
  });

  it("Cloud Starter is a hard cap at 25", () => {
    const starter = product.plans.find((p) => p.id === "starter")!;
    expect(mailboxUsageFor(starter, 24).canAdd).toBe(true);
    expect(mailboxUsageFor(starter, 25).canAdd).toBe(false);
  });

  it("Cloud Growth is metered: extras above 100 cost $0.99 each and are never refused", () => {
    const growth = product.plans.find((p) => p.id === "growth")!;
    expect(mailboxUsageFor(growth, 100)).toMatchObject({ mode: "metered", extra: 0, estimatedExtraCents: 0, canAdd: true });
    expect(mailboxUsageFor(growth, 112)).toMatchObject({ extra: 12, extraPriceCents: 99, estimatedExtraCents: 1188, canAdd: true });
    expect(mailboxUsageFor(growth, 70).state.level).toBe("ok");
    expect(mailboxUsageFor(growth, 85).state.level).toBe("near");
  });

  it("warns at 80%, calls 100% at the limit, flags over only above it", () => {
    const free = product.plans[0]!;
    expect(mailboxUsageFor(free, 2).state.level).toBe("ok");
    expect(mailboxUsageFor(free, 3).state.level).toBe("at");
    expect(mailboxUsageFor(free, 4).state.level).toBe("over");
    expect(mailboxUsageFor(product.plans.find((p) => p.id === "starter")!, 20).state.level).toBe("near");
  });

  it("Self-host has no limit", async () => {
    await db.setEntitlement("org_1", paid("selfhost"));
    await addAccounts(db, "org_1", 40);
    expect(await mailboxUsage(db, "org_1", NOW)).toMatchObject({ mode: "unlimited", canAdd: true, extra: 0 });
  });

  it("ensureCapacity refuses a NEW address on a full plan but lets an existing one reconnect", async () => {
    await addAccounts(db, "org_1", 3);
    const { env } = await setupEnv(db, "org_1");
    await expect(ensureCapacity(db, env.id, "new@example.test")).rejects.toMatchObject({ status: 402 });
    await expect(ensureCapacity(db, env.id, "u0-production@example.test")).resolves.toBeUndefined();
  });
});

describe("extra mailbox billing line", () => {
  type Line = { id: string; quantity: number; price: { lookup_key: string } };
  function fake(lines: Line[]) {
    const calls: string[] = [];
    const stripe = {
      subscriptions: { retrieve: async () => ({ id: "sub_1", metadata: { app: "inboxwire" }, items: { data: lines } }) },
      subscriptionItems: {
        create: async (p: { quantity: number }) => { calls.push(`create:${p.quantity}`); return {}; },
        update: async (id: string, p: { quantity: number }) => { calls.push(`update:${p.quantity}`); return {}; },
        del: async () => { calls.push("del"); return {}; },
      },
      prices: { list: async () => ({ data: [{ id: "price_extra", metadata: { app: "inboxwire" } }] }) },
    };
    return { stripe: stripe as never, calls };
  }
  let db: Db;
  beforeEach(async () => { db = newDb(); await db.setEntitlement("org_1", paid("growth")); });

  it("adds the line with the extra count, updates it, and removes it at zero", async () => {
    await addAccounts(db, "org_1", 103);
    let f = fake([]);
    expect(await syncExtraMailboxes(f.stripe, db, "org_1")).toBe(3);
    expect(f.calls).toEqual(["create:3"]);
    f = fake([{ id: "si_x", quantity: 1, price: { lookup_key: "inboxwire_extra_mailbox_monthly" } }]);
    await syncExtraMailboxes(f.stripe, db, "org_1");
    expect(f.calls).toEqual(["update:3"]);
    f = fake([{ id: "si_x", quantity: 3, price: { lookup_key: "inboxwire_extra_mailbox_monthly" } }]);
    await syncExtraMailboxes(f.stripe, db, "org_1");
    expect(f.calls).toEqual([]);
  });

  it("removes the line when back within the allowance, does nothing on non-metered plans", async () => {
    await addAccounts(db, "org_1", 90);
    const f = fake([{ id: "si_x", quantity: 3, price: { lookup_key: "inboxwire_extra_mailbox_monthly" } }]);
    expect(await syncExtraMailboxes(f.stripe, db, "org_1")).toBe(0);
    expect(f.calls).toEqual(["del"]);
    await db.setEntitlement("org_1", paid("starter"));
    expect(await syncExtraMailboxes(fake([]).stripe, db, "org_1")).toBeNull();
  });
});

describe("GET /v1/usage", () => {
  beforeEach(() => vi.resetModules());
  it("matches the meter and OpenAPI documents it", async () => {
    const db = newDb();
    await db.setEntitlement("org_u", paid("growth"));
    await addAccounts(db, "org_u", 102);
    vi.doMock("@/lib/db", () => ({ getDb: async () => db }));
    vi.doMock("@/lib/auth/session", () => ({ authApiKey: async () => ({ orgId: "org_u", keyId: "k", scopes: ["read"] }) }));
    const route = await import("@/app/api/v1/usage/route");
    const res = await route.GET(new Request("http://localhost/api/v1/usage", { headers: { "x-api-key": "k" } }), undefined as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      plan: { id: "growth" },
      mailboxes: { used: 102, included: 100, extra: 2, mode: "metered", extraPriceCents: 99, estimatedExtraCents: 198, level: "over", canAdd: true },
      environments: { used: 1, limit: 3 },
    });
    const [meter] = await currentUsage(db, "org_u", ["mailboxes"]);
    expect(meter!.used).toBe(102);
    const doc = buildOpenApi("https://x.test") as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths["/usage"]!.get).toBeTruthy();
    expect(doc.paths["/accounts/{id}"]!.delete).toBeTruthy();
  });
});
