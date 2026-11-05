import { beforeEach, describe, expect, it, vi } from "vitest";
import { webhook } from "@/lib/mailcore";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import type { MailMessage, MailTransport } from "@/lib/mail";
import { notifyEndpointDisabled } from "@/lib/webhooks/notify";
import { DEFAULT_EVENTS, EVENT_TYPES, emitEvent, replayDelivery, replayFailed, retryDueDeliveries } from "@/lib/webhooks/outbound";

let db: Db;
beforeEach(() => { db = createMemoryDb("inboxwire"); });
const T0 = new Date("2026-11-05T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const H = 3600_000;

function endpoint(over: Partial<Parameters<Db["createWebhookEndpoint"]>[0]> = {}) {
  return db.createWebhookEndpoint({ id: "ep1", orgId: "o1", envId: "e1", url: "https://hooks.test/a", secret: "whsec_1", events: ["messageNew"], enabled: true, ...over });
}
function receiver() {
  const seen: { body: string; headers: Headers }[] = [];
  const state = { status: 200, delayMs: 0 };
  const fetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ body: String(init.body), headers: new Headers(init.headers) });
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    return new Response(state.status === 200 ? "ok" : "boom", { status: state.status });
  }) as unknown as typeof fetch;
  return { seen, state, fetchFn };
}

describe("signed delivery (mailcore webhook.ts)", () => {
  it("signs with Inboxwire-Signature = mailcore sign(); tampering and replays outside the window fail", async () => {
    await endpoint();
    const r = receiver();
    await emitEvent("o1", "messageNew", { accountId: "a1", messageId: "m1" }, { db, fetchFn: r.fetchFn, now: T0, envId: "e1" });
    const { body, headers } = r.seen[0]!;
    const sig = headers.get("inboxwire-signature")!;
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(sig).toBe(headers.get("x-webhook-signature"));
    expect(sig).toBe(webhook.sign("whsec_1", body, Math.floor(T0.getTime() / 1000)));
    const now = Math.floor(T0.getTime() / 1000);
    expect(webhook.verify("whsec_1", body, sig, 300, now)).toBe(true);
    expect(webhook.verify("whsec_1", body + " ", sig, 300, now)).toBe(false);
    expect(webhook.verify("whsec_other", body, sig, 300, now)).toBe(false);
    expect(webhook.verify("whsec_1", body, sig, 300, now + 301)).toBe(false);
    expect(JSON.parse(body)).toMatchObject({ type: "messageNew", data: { messageId: "m1" } });
  });

  it("event id header equals the payload id", async () => {
    await endpoint();
    const r = receiver();
    await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: T0, envId: "e1" });
    expect(r.seen[0]!.headers.get("x-webhook-id")).toBe(JSON.parse(r.seen[0]!.body).id);
  });
});

describe("endpoints: environments and allowlist", () => {
  it("delivers only allowlisted events from the endpoint's environment; org-wide endpoints see every environment", async () => {
    await endpoint({ id: "ep_e1", envId: "e1", events: ["messageNew"] });
    await endpoint({ id: "ep_e2", envId: "e2", events: ["messageNew"] });
    await endpoint({ id: "ep_all", envId: null, events: ["messageNew", "messageSent"] });
    const r = receiver();
    const out = await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: T0, envId: "e1" });
    expect(out.map((d) => d.endpointId).sort()).toEqual(["ep_all", "ep_e1"]);
    expect(await emitEvent("o1", "messageSent", {}, { db, fetchFn: r.fetchFn, now: T0, envId: "e2" })).toHaveLength(1); // only ep_all lists messageSent
    expect(await emitEvent("o1", "messageDeleted", {}, { db, fetchFn: r.fetchFn, now: T0, envId: "e1" })).toHaveLength(0);
  });
  it("new endpoints default to messageNew and only known event types exist", () => {
    expect(DEFAULT_EVENTS).toEqual(["messageNew"]);
    expect(EVENT_TYPES).toContain("messageFailed");
  });
});

describe("retries, delivery log, recovery", () => {
  it("logs status code, latency and response snippet", async () => {
    await endpoint();
    const r = receiver();
    r.state.status = 500;
    r.state.delayMs = 15;
    const [d] = await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: T0, envId: "e1" });
    expect(d).toMatchObject({ status: "retrying", lastStatusCode: 500, lastResponseSnippet: "boom", envId: "e1" });
    expect(d!.lastLatencyMs).toBeGreaterThanOrEqual(10);
    expect((await db.getDelivery("o1", d!.id))).toMatchObject({ lastError: "http_500" });
  });

  it("endpoint down for 1 hour: every event is delivered after recovery (fake clock)", async () => {
    await endpoint();
    const r = receiver();
    r.state.status = 503;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(...(await emitEvent("o1", "messageNew", { n: i }, { db, fetchFn: r.fetchFn, now: at(i * 10 * 60_000), envId: "e1" })).map((d) => d.id));
    // retries during the outage keep failing
    for (let m = 0; m <= 60; m += 5) await retryDueDeliveries({ db, fetchFn: r.fetchFn, now: at(m * 60_000), notify: async () => {} });
    expect((await db.listDeliveries("o1")).every((d) => d.status === "retrying")).toBe(true);
    // recovery at +1h: the next due retries all succeed within the first backoff hours
    r.state.status = 200;
    for (let m = 61; m <= 61 + 6 * 60; m += 10) await retryDueDeliveries({ db, fetchFn: r.fetchFn, now: at(m * 60_000), notify: async () => {} });
    for (const id of ids) expect((await db.getDelivery("o1", id))?.status).toBe("succeeded");
    expect((await db.getWebhookEndpoint("o1", "ep1"))).toMatchObject({ enabled: true, failingSince: null });
  });
});

describe("replay", () => {
  async function failedDelivery(r = receiver()) {
    await endpoint();
    r.state.status = 500;
    const [d] = await emitEvent("o1", "messageNew", { messageId: "m9" }, { db, fetchFn: r.fetchFn, now: T0, envId: "e1" });
    await db.updateDelivery(d!.id, { status: "failed", nextAttemptAt: null });
    return { d: d!, r };
  }

  it("one-click replay re-sends the stored payload with the same event id as a new delivery", async () => {
    const { d, r } = await failedDelivery();
    r.state.status = 200;
    const res = await replayDelivery("o1", d.id, { db, fetchFn: r.fetchFn, now: at(H) });
    expect(res.ok && res.delivery).toMatchObject({ status: "succeeded", replayOf: d.id, eventId: d.id });
    const last = r.seen[r.seen.length - 1]!;
    expect(last.body).toBe(d.payload);
    expect(last.headers.get("x-webhook-id")).toBe(d.id);
    expect(webhook.verify("whsec_1", last.body, last.headers.get("inboxwire-signature")!, 300, Math.floor(at(H).getTime() / 1000))).toBe(true);
    expect((await db.getDelivery("o1", d.id))!.replayedAt).toBeTruthy();
  });

  it("refuses unknown deliveries, other orgs and disabled endpoints", async () => {
    const { d, r } = await failedDelivery();
    expect(await replayDelivery("o1", "nope", { db, fetchFn: r.fetchFn })).toEqual({ ok: false, reason: "not_found" });
    expect(await replayDelivery("o2", d.id, { db, fetchFn: r.fetchFn })).toEqual({ ok: false, reason: "not_found" });
    await db.updateWebhookEndpoint("o1", "ep1", { enabled: false });
    expect(await replayDelivery("o1", d.id, { db, fetchFn: r.fetchFn })).toEqual({ ok: false, reason: "endpoint_disabled" });
  });

  it("bulk replay re-sends failed deliveries once, and respects the environment filter", async () => {
    const { r } = await failedDelivery();
    for (let i = 0; i < 2; i++) {
      const [x] = await emitEvent("o1", "messageNew", { i }, { db, fetchFn: r.fetchFn, now: T0, envId: "e1" });
      await db.updateDelivery(x!.id, { status: "failed", nextAttemptAt: null });
    }
    r.state.status = 200;
    expect(await replayFailed("o1", { db, fetchFn: r.fetchFn, now: at(H), envId: "other" })).toEqual({ replayed: 0, succeeded: 0, skipped: 0 });
    expect(await replayFailed("o1", { db, fetchFn: r.fetchFn, now: at(H), envId: "e1" })).toEqual({ replayed: 3, succeeded: 3, skipped: 0 });
    expect(await replayFailed("o1", { db, fetchFn: r.fetchFn, now: at(2 * H), envId: "e1" })).toEqual({ replayed: 0, succeeded: 0, skipped: 0 });
  });
});

describe("auto-disable after 72 h of failures", () => {
  it("disables the endpoint, audits it and notifies once; a success earlier resets the clock", async () => {
    await endpoint();
    const r = receiver();
    r.state.status = 500;
    const notify = vi.fn(async () => {});
    await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: T0, envId: "e1", notify });
    expect((await db.getWebhookEndpoint("o1", "ep1"))!.failingSince).toEqual(T0);
    await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: at(71 * H), envId: "e1", notify });
    expect(notify).not.toHaveBeenCalled();
    expect((await db.getWebhookEndpoint("o1", "ep1"))!.enabled).toBe(true);
    await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: at(72 * H), envId: "e1", notify });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("o1", expect.objectContaining({ id: "ep1" }), "72 hours of failed deliveries");
    expect(await db.getWebhookEndpoint("o1", "ep1")).toMatchObject({ enabled: false, disabledReason: "72 hours of failed deliveries", disabledAt: at(72 * H) });
    expect((await db.listAudit("o1")).map((a) => a.action)).toContain("webhook.auto_disabled");
    // no further events while disabled
    expect(await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: at(73 * H), envId: "e1", notify })).toHaveLength(0);
  });

  it("one success clears the failure clock", async () => {
    await endpoint();
    const r = receiver();
    r.state.status = 500;
    await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: T0, envId: "e1", notify: async () => {} });
    r.state.status = 200;
    await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: at(30 * H), envId: "e1", notify: async () => {} });
    expect((await db.getWebhookEndpoint("o1", "ep1"))!.failingSince).toBeNull();
    r.state.status = 500;
    await emitEvent("o1", "messageNew", {}, { db, fetchFn: r.fetchFn, now: at(80 * H), envId: "e1", notify: async () => {} });
    expect((await db.getWebhookEndpoint("o1", "ep1"))!.enabled).toBe(true);
  });

  it("emails every owner through the Mailer and never includes the secret", async () => {
    const sent: MailMessage[] = [];
    const transport: MailTransport = { name: "test", async send(m) { sent.push(m); return { id: "1", provider: "test", accepted: true }; } };
    const ep = await endpoint();
    vi.resetModules();
    const n = await notifyEndpointDisabled("o1", ep, "72 hours of failed deliveries", { owners: async () => ["owner@example.test", "co@example.test"], transport });
    expect(n).toBe(2);
    expect(sent.map((m) => m.to)).toEqual(["owner@example.test", "co@example.test"]);
    expect(sent[0]!.subject).toContain("hooks.test");
    expect(sent[0]!.text).toContain("72 hours");
    expect(sent[0]!.text).not.toContain("whsec_1");
  });
});

describe("re-enabling via PATCH /v1/webhooks/{id}", () => {
  it("clears failingSince and the disabled reason", async () => {
    vi.resetModules();
    const mdb = createMemoryDb("inboxwire");
    vi.doMock("@/lib/db", () => ({ getDb: async () => mdb }));
    vi.doMock("@/lib/auth/session", () => ({ authApiKey: async () => ({ orgId: "o1", keyId: "k", scopes: ["admin"] }) }));
    const env = await mdb.ensureEnvironment("o1", "production");
    await mdb.createWebhookEndpoint({ id: "epx", orgId: "o1", envId: env.id, url: "https://hooks.test/x", secret: "s", events: ["messageNew"], enabled: false, failingSince: T0, disabledAt: T0, disabledReason: "72 hours of failed deliveries" });
    const { PATCH } = await import("@/app/api/v1/webhooks/[id]/route");
    const res = await PATCH(new Request("http://localhost/api/v1/webhooks/epx", { method: "PATCH", headers: { "x-api-key": "k", "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) }), { params: Promise.resolve({ id: "epx" }) });
    expect(res.status).toBe(200);
    expect(await mdb.getWebhookEndpoint("o1", "epx")).toMatchObject({ enabled: true, failingSince: null, disabledAt: null, disabledReason: null });
  });
});
