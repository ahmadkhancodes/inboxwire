import { describe, expect, it, vi } from "vitest";
import { syncAccount } from "@/lib/backends";
import { NONE } from "@/lib/billing/entitlement";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { completeImap } from "@/lib/connect/complete";
import { assertLink, lookupConnectLink } from "@/lib/connect/links";
import type { Db, Entitlement, WebhookDelivery } from "@/lib/db/types";
import { sendMailSafe, type MailTransport } from "@/lib/mail";
import { resendTransport } from "@/lib/mail/transports";
import { notifyEndpointDisabled } from "@/lib/webhooks/notify";
import { attemptDelivery, emitEvent } from "@/lib/webhooks/outbound";
import { buttonClass } from "@/components/ui/button";
import { event, fakeStripe } from "./fakes";
import { fakeImap, imapAccount, newDb, newLink } from "./m2-helpers";

// Launch hardening (M6): regression tests for the P1s closed in docs/REVIEW.md. Each fails on the code before the fix.

const paid = (plan: Entitlement["plan"]): Entitlement => ({ ...NONE(Date.now()), isPaid: true, status: "active", plan, interval: "month", expiresAt: Date.now() + 20 * 864e5, subscriptionId: "sub_1" });

async function pendingDelivery(db: Db) {
  const ep = await db.createWebhookEndpoint({ id: "ep1", orgId: "o1", envId: null, url: "https://hooks.test/a", secret: "whsec_1", events: ["messageNew"], enabled: true });
  const [d] = await emitEvent("o1", "messageNew", { a: 1 }, { db, attempt: false });
  return { ep, d: d as WebhookDelivery };
}

describe("P1-8 webhook delivery lease", () => {
  it("two attempts at the same delivery POST once; a finished delivery is never re-sent", async () => {
    const db = newDb();
    const { ep, d } = await pendingDelivery(db);
    let posts = 0;
    const fetchFn = (async () => { posts++; await new Promise((r) => setTimeout(r, 20)); return new Response("ok", { status: 200 }); }) as unknown as typeof fetch;
    const lookup = async () => ["93.184.216.34"];
    const [a, b] = await Promise.all([attemptDelivery(d, ep, { db, fetchFn, lookup }), attemptDelivery(d, ep, { db, fetchFn, lookup })]);
    expect(posts).toBe(1);
    expect([a.status, b.status].sort()).toEqual(["pending", "succeeded"]);
    await attemptDelivery(d, ep, { db, fetchFn, lookup });
    expect(posts).toBe(1);
  });
});

describe("P1-9 one sync per account at a time", () => {
  it("a push hook and the poll cron together read the mailbox once and queue each event once", async () => {
    const db = newDb();
    const state = { uidValidity: 1, uidNext: 3, uids: [1, 2], connects: 0 };
    const a = await imapAccount(db, state);
    let emitted = 0;
    const emit = async () => { emitted++; };
    const imapFactory = fakeImap(state);
    // Prime the cursor, then add a message and sync twice at once.
    await syncAccount(db, a.id, { imapFactory, emit });
    emitted = 0; state.connects = 0; state.uids = [1, 2, 3]; state.uidNext = 4;
    const [x, y] = await Promise.all([syncAccount(db, a.id, { imapFactory, emit }), syncAccount(db, a.id, { imapFactory, emit })]);
    expect(emitted).toBe(1);
    expect(x.ok && y.ok).toBe(true);
    // The refused caller marked the account dirty, so the holder looked once more; the lease is free afterwards.
    expect(await db.claimSync(a.id, new Date(), 1000)).toBe(true);
  });
});

describe("P1-13 mailbox cap race", () => {
  it("two simultaneous connects cannot both take the last slot of a hard-capped plan", async () => {
    const db = newDb();
    const state = { uidValidity: 1, uidNext: 1, uids: [], connects: 0 };
    await imapAccount(db, state, "org_1", { email: "a@example.test", externalId: "a" });
    await imapAccount(db, state, "org_1", { email: "b@example.test", externalId: "b" });
    // Both connects pass `ensureCapacity` before either registers: the lookup (which runs after it) is a barrier.
    let waiting = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const lookup = async () => { if (++waiting >= 2) release(); await gate; return ["93.184.216.34"]; };
    const connect = async (email: string) => {
      const { token } = await newLink(db, "org_1", { externalId: email });
      const link = assertLink(await lookupConnectLink(db, token));
      return completeImap(db, link, { email, imap: { host: "imap.fastmail.com", port: 993, secure: true, user: "x", pass: "y" } }, { imapFactory: fakeImap(state), noBilling: true, lookup });
    };
    const r = await Promise.allSettled([connect("c@example.test"), connect("d@example.test")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.find((x) => x.status === "rejected")).toMatchObject({ reason: { status: 402, code: "mailbox_limit" } });
    const env = await db.ensureEnvironment("org_1", "production");
    expect(await db.listAccounts(env.id)).toHaveLength(3);
  });
});

describe("P1-11 plan limits", () => {
  it("a one-environment plan cannot open a second environment; Growth can", async () => {
    vi.resetModules();
    let org = "org_env";
    vi.doMock("@/lib/auth/session", () => ({ authApiKey: async () => ({ orgId: org, keyId: "k", scopes: ["read"], environment: null }) }));
    const { authEnv } = await import("@/lib/connect/env");
    const db = newDb();
    await authEnv(new Request("http://x.test/v1"), "read", db);
    await expect(authEnv(new Request("http://x.test/v1", { headers: { "x-environment": "staging" } }), "read", db)).rejects.toMatchObject({ status: 402, code: "environment_limit" });
    await db.setEntitlement(org, paid("growth"));
    expect((await authEnv(new Request("http://x.test/v1", { headers: { "x-environment": "staging" } }), "read", db)).env.name).toBe("staging");
    org = "org_env";
    vi.doUnmock("@/lib/auth/session");
  });

  it("the delivery log is kept for the plan's log_days", async () => {
    const db = newDb();
    await db.createWebhookEndpoint({ id: "ep1", orgId: "o1", envId: null, url: "https://hooks.test/a", secret: "s", events: ["messageNew"], enabled: true });
    const now = new Date("2026-11-10T00:00:00Z");
    const [free] = await emitEvent("o1", "messageNew", {}, { db, attempt: false, now });
    expect(free!.expireAt.getTime() - now.getTime()).toBe(7 * 864e5);
    await db.setEntitlement("o1", paid("growth"));
    const [g] = await emitEvent("o1", "messageNew", {}, { db, attempt: false, now });
    expect(g!.expireAt.getTime() - now.getTime()).toBe(90 * 864e5);
  });
});

describe("P1-14 touch targets", () => {
  it("small buttons are 44px tall on touch screens", () => {
    expect(buttonClass("primary", "sm")).toContain("min-h-11");
  });
});

describe("Stripe webhook: out of order, duplicate and unknown events", () => {
  const NOW = 1_800_000_000_000;
  async function setup() {
    const db = newDb();
    const f = fakeStripe();
    const c = await f.stripe.customers.create({ metadata: { app: "inboxwire" } });
    await db.upsertBillingAccount({ id: "org_1", stripeCustomerId: c.id, email: null });
    return { db, f, cus: c.id };
  }
  const run = (db: Db, f: ReturnType<typeof fakeStripe>, body: string) => handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "x", now: () => NOW });
  const lifetimePi = (cus: string, refunded: boolean) => ({ id: "pi_life", customer: cus, metadata: { app: "inboxwire", mode: "lifetime", lookup_key: "inboxwire_selfhost_annual" }, _refunded: refunded });

  it("payment_intent.succeeded arriving AFTER its full refund does not grant the lifetime plan", async () => {
    const { db, f, cus } = await setup();
    (f.stripe as unknown as { paymentIntents: unknown }).paymentIntents = {
      retrieve: async () => ({ id: "pi_life", latest_charge: { refunded: true, amount: 9900, amount_refunded: 9900 } }),
    };
    await run(db, f, event("charge.refunded", { customer: cus, refunded: true, payment_intent: "pi_life" }));
    const { _refunded, ...pi } = lifetimePi(cus, true); void _refunded;
    const res = await run(db, f, event("payment_intent.succeeded", pi));
    expect(res.status).toBe(200);
    expect((await db.getEntitlement("org_1"))?.status).not.toBe("lifetime");
  });

  it("payment_intent.succeeded for a paid, unrefunded lifetime purchase still grants it, and a duplicate changes nothing", async () => {
    const { db, f, cus } = await setup();
    (f.stripe as unknown as { paymentIntents: unknown }).paymentIntents = { retrieve: async () => ({ id: "pi_life", latest_charge: { refunded: false, amount: 9900, amount_refunded: 0 } }) };
    const { _refunded, ...pi } = lifetimePi(cus, false); void _refunded;
    const body = event("payment_intent.succeeded", pi, "evt_dup");
    await run(db, f, body);
    expect((await db.getEntitlement("org_1"))?.status).toBe("lifetime");
    expect((await (await run(db, f, body)).json()).duplicate).toBe(true);
  });

  it("subscription events in any order converge on Stripe's state; unknown events answer 200", async () => {
    const { db, f, cus } = await setup();
    f.addSub(cus, "inboxwire_growth_monthly", "active");
    for (const t of ["customer.subscription.deleted", "invoice.paid", "checkout.session.completed", "customer.subscription.created"]) {
      expect((await run(db, f, event(t, { customer: cus }))).status).toBe(200);
    }
    expect(await db.getEntitlement("org_1")).toMatchObject({ isPaid: true, plan: "growth" });
    const odd = await run(db, f, event("some.future.event", { customer: cus }, "evt_odd"));
    expect(odd.status).toBe(200);
    expect(await db.hasStripeEvent("evt_odd")).toBe(true);
    expect(await db.getEntitlement("org_1")).toMatchObject({ isPaid: true, plan: "growth" });
  });

  it("a duplicated refund event does not revoke twice or touch a later plan", async () => {
    const { db, f, cus } = await setup();
    f.addSub(cus, "inboxwire_growth_monthly", "active");
    const body = event("charge.refunded", { customer: cus, refunded: true, payment_intent: "pi_1" }, "evt_ref");
    await run(db, f, body);
    f.addSub(cus, "inboxwire_growth_annual", "active"); // customer buys again
    await run(db, f, body); // Stripe redelivers the old event
    await run(db, f, event("invoice.paid", { customer: cus }));
    expect(await db.getEntitlement("org_1")).toMatchObject({ isPaid: true });
  });
});

describe("email routes survive a Resend rejection", () => {
  const rejecting = (msg: string): MailTransport => ({ name: "t", async send() { throw new Error(msg); } });

  it("sendMailSafe never throws and never returns the provider's text", async () => {
    const r = await sendMailSafe({ to: "x@example.test", subject: "s", text: "t" }, rejecting("mail_send_failed_422 secret-provider-detail"));
    expect(r).toEqual({ ok: false });
  });

  it("the Resend adapter maps 429/422 to a bare status code, with a timeout", async () => {
    let signal: AbortSignal | null | undefined;
    const t = resendTransport("re_key", (async (_u: string, init: RequestInit) => { signal = init.signal; return new Response('{"message":"invalid to address"}', { status: 422 }); }) as unknown as typeof fetch);
    await expect(t.send({ from: "a@b.test", to: "bad", subject: "s", text: "t" })).rejects.toThrow(/^mail_send_failed_422$/);
    expect(signal).toBeTruthy();
  });

  it("one owner's bounce does not stop the others from being told about a disabled endpoint", async () => {
    const sent: string[] = [];
    const transport: MailTransport = { name: "t", async send(m) { if (m.to === "bad@example.test") throw new Error("mail_send_failed_422"); sent.push(m.to); return { id: "1", provider: "t", accepted: true }; } };
    const n = await notifyEndpointDisabled("o1", { id: "e", orgId: "o1", envId: null, url: "https://h.test/x", secret: "s", events: [], enabled: false } as never, "72 hours", { owners: async () => ["bad@example.test", "ok@example.test"], transport });
    expect(sent).toEqual(["ok@example.test"]);
    expect(n).toBe(1);
  });
});
