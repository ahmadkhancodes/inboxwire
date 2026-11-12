import { beforeEach, describe, expect, it } from "vitest";
import { planById, product } from "@/config/product";
import { clearPriceCache } from "@/lib/billing/catalog";
import { checkoutReturnUrls, createCheckoutSession, createPortalSession } from "@/lib/billing/checkout";
import { effectivePlan } from "@/lib/billing/entitlement";
import { mailboxUsage } from "@/lib/billing/mailboxes";
import { currentUsage } from "@/lib/billing/usage";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { event, fakeStripe } from "./fakes";

// The upgrade journey end to end, as far as Stripe test mode allows without card entry: plan choice -> Checkout
// Session (lookup key, metadata.app, return URLs) -> webhook activates the plan AND its limits -> portal -> cancel at
// period end -> subscription deleted downgrades to Free limits (mailboxes over the cap are kept but no new ones).
const NOW = 1_800_000_000_000;
const ORG = "org_j";
const subject = { orgId: ORG, email: "clara@northwind.test", userId: "u_clara" };
let db: Db;
let f: ReturnType<typeof fakeStripe>;
const hook = (body: string) => handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "whsec_x", now: () => NOW });

async function connect(n: number) {
  const env = await db.ensureEnvironment(ORG, "production");
  for (let i = 0; i < n; i++) await db.upsertAccount({ id: `acc_${i}`, envId: env.id, externalId: `u${i}`, email: `u${i}@northwind.test`, provider: "imap", backend: "imap", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
}

beforeEach(() => {
  db = createMemoryDb("inboxwire");
  f = fakeStripe();
  clearPriceCache();
});

describe("checkout return URLs", () => {
  it("come back to the billing page with a visible outcome", () => {
    expect(checkoutReturnUrls("https://inboxwire.buffersoltech.com/")).toEqual({
      success: "https://inboxwire.buffersoltech.com/app/billing?checkout=success",
      cancel: "https://inboxwire.buffersoltech.com/app/billing?checkout=canceled",
    });
  });
});

describe("upgrade journey: Developer at its mailbox cap -> Cloud Growth -> cancel -> Developer", () => {
  it("runs end to end with the right price, metadata and limits at every step", async () => {
    // Day 7: Free plan, 3 of 3 mailboxes, a 4th is refused.
    await connect(3);
    let u = await mailboxUsage(db, ORG, new Date(NOW));
    expect(u).toMatchObject({ mode: "hard_cap", used: 3, included: planById("free")!.limits.mailboxes, canAdd: false });

    // Plan selection creates the right Checkout Session.
    const urls = checkoutReturnUrls("https://app.test");
    const r = await createCheckoutSession(f.stripe, db, subject, "growth", "month", urls);
    expect(r.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const call = f.calls.find((c) => c.method === "checkout.sessions.create")!.args as Record<string, any>;
    const growthMonthly = planById("growth")!.prices.find((p) => p.interval === "month")!;
    expect(growthMonthly.lookupKey).toBe("inboxwire_growth_monthly");
    const priceListCall = f.calls.find((c) => c.method === "prices.list")!;
    expect((priceListCall.args as { lookup_keys: string[] }).lookup_keys).toContain(growthMonthly.lookupKey);
    expect(call.line_items).toEqual([{ price: "price_pro_m", quantity: 1 }]);
    expect(call.metadata).toMatchObject({ app: "inboxwire", plan: "growth", interval: "month", org_id: ORG });
    expect(call.subscription_data.metadata).toMatchObject({ app: "inboxwire", plan: "growth" });
    expect(call.success_url).toBe("https://app.test/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(call.cancel_url).toBe("https://app.test/app/billing?checkout=canceled");
    const cus = (await db.getBillingAccount(ORG))!.stripeCustomerId!;
    expect(f.customers.get(cus)?.metadata).toMatchObject({ app: "inboxwire", org_id: ORG });

    // Stripe confirms: the webhook activates the plan and its limits.
    const sub = f.addSub(cus, "inboxwire_growth_monthly");
    expect((await hook(event("checkout.session.completed", { customer: cus }, "evt_j1"))).status).toBe(200);
    expect(effectivePlan(await db.getEntitlement(ORG), NOW).id).toBe("growth");
    u = await mailboxUsage(db, ORG, new Date(NOW));
    expect(u).toMatchObject({ mode: "metered", included: planById("growth")!.limits.mailboxes, canAdd: true, extraPriceCents: product.extraMailbox.usd });
    const env = (await currentUsage(db, ORG, ["environments"], new Date(NOW)))[0]!;
    expect(env.limit).toBe(planById("growth")!.limits.environments);

    // The portal link opens for this customer and returns to billing.
    const portal = await createPortalSession(f.stripe, db, ORG, "https://app.test/app/billing");
    expect(portal.url).toContain("billing.stripe.test");
    const pcall = f.calls.find((c) => c.method === "billingPortal.sessions.create")!.args as Record<string, unknown>;
    expect(pcall).toMatchObject({ customer: cus, return_url: "https://app.test/app/billing" });

    // Cancel in the portal: stays Growth until the period ends.
    sub.cancel_at_period_end = true;
    await hook(event("customer.subscription.updated", { customer: cus }, "evt_j2"));
    const ent = await db.getEntitlement(ORG);
    expect(ent).toMatchObject({ plan: "growth", cancelAtPeriodEnd: true });
    expect(effectivePlan(ent, NOW).id).toBe("growth");

    // Period over: Stripe deletes the subscription, the org is back on Developer limits.
    sub.status = "canceled";
    await hook(event("customer.subscription.deleted", { customer: cus }, "evt_j3"));
    expect(await db.getEntitlement(ORG)).toMatchObject({ isPaid: false, plan: "free" });
    u = await mailboxUsage(db, ORG, new Date(NOW));
    expect(u).toMatchObject({ mode: "hard_cap", used: 3, included: 3, canAdd: false });
  });
});
