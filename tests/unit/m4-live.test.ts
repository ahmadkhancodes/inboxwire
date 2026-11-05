import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTimeline, eventsFrom, explainState, lampLabel, lampOf, loadLines, snapshot } from "@/lib/live/lines";
import { collectMetrics, renderMetrics } from "@/lib/metrics";
import { createLiveStream } from "@/lib/live/stream";
import { emitEvent } from "@/lib/webhooks/outbound";
import type { AccountState } from "@/lib/mailcore";
import type { Db, MailAccount } from "@/lib/db/types";
import { newDb, setupEnv } from "./m2-helpers";

async function line(db: Db, id: string, state: AccountState = "connected", over: Partial<MailAccount> = {}) {
  const { env } = await setupEnv(db, "org_1");
  return db.upsertAccount({ id, envId: env.id, externalId: id, email: `${id}@example.test`, provider: "google", backend: "gmail_api", state, lastError: null, nextPollAt: null, mode: "push", ...over });
}
async function endpoint(db: Db) {
  return db.createWebhookEndpoint({ id: "ep_1", orgId: "org_1", url: "https://hooks.example.com/in", secret: "whsec_x", events: ["*"], enabled: true });
}
const ok = vi.fn(async () => new Response("ok", { status: 200 }));

describe("lines, explanations and timeline", () => {
  let db: Db;
  beforeEach(() => { db = newDb(); });

  it("every state of the state machine has a lamp and a plain explanation with a fix", () => {
    const states: AccountState[] = ["connecting", "syncing", "connected", "throttled", "authenticationError", "connectError"];
    const lamps = states.map((s) => lampOf({ state: s }));
    expect(lamps).toEqual(["idle", "syncing", "live", "throttled", "error", "error"]);
    expect(states.map((s) => lampLabel({ state: s }))).toEqual(["connecting", "syncing", "live", "throttled", "sign-in needed", "unreachable"]);
    for (const s of states) {
      const e = explainState({ state: s, provider: "google", lastError: null, mode: "polling" });
      expect(e.title && e.cause && e.fix).toBeTruthy();
    }
    expect(explainState({ state: "authenticationError", provider: "imap", lastError: null, mode: "polling" }).cause).toMatch(/login/);
    expect(explainState({ state: "connectError", provider: "imap", lastError: "ECONNREFUSED", mode: "polling" }).cause).toMatch(/ECONNREFUSED/);
    expect(explainState({ state: "connected", provider: "google", lastError: null, mode: "polling" }).fix).toMatch(/Pub\/Sub/);
  });

  it("loadLines lists accounts across environments with the last event per line", async () => {
    await line(db, "a1");
    await line(db, "a2", "authenticationError", { lastError: "invalid_grant" });
    await endpoint(db);
    await emitEvent("org_1", "messageNew", { accountId: "a1" }, { db, fetchFn: ok, now: new Date("2026-11-05T10:00:00Z") });
    await emitEvent("org_1", "messageMoved", { accountId: "a1" }, { db, fetchFn: ok, now: new Date("2026-11-05T10:05:00Z") });
    const lines = await loadLines(db, "org_1");
    expect(lines.map((l) => [l.id, l.lamp])).toEqual([["a1", "live"], ["a2", "error"]]);
    expect(lines[0]!.lastEvent).toMatchObject({ type: "messageMoved", accountId: "a1" });
    expect(lines[1]!.lastEvent).toBeNull();
    expect(lines[1]!.explanation.title).toBe("Sign-in needed");
  });

  it("eventsFrom dedupes by event id (replays and several endpoints) and is newest first", async () => {
    await line(db, "a1");
    await endpoint(db);
    await db.createWebhookEndpoint({ id: "ep_2", orgId: "org_1", url: "https://two.example.com/in", secret: "whsec_y", events: ["*"], enabled: true });
    await emitEvent("org_1", "messageNew", { accountId: "a1" }, { db, fetchFn: ok, now: new Date("2026-11-05T10:00:00Z") });
    const ds = await db.listDeliveries("org_1");
    expect(ds).toHaveLength(2);
    expect(eventsFrom(ds)).toHaveLength(2); // two endpoints = two event ids today (one per delivery)
    const same = ds.map((d) => ({ ...d, eventId: "evt_same" }));
    expect(eventsFrom(same)).toHaveLength(1);
  });

  it("buildTimeline merges connection, events, sends and watch state, newest first", async () => {
    const a = await line(db, "a1", "throttled", { watch: { id: "w", expiresAt: new Date("2026-11-08T00:00:00Z") } });
    await endpoint(db);
    await emitEvent("org_1", "messageNew", { accountId: "a1" }, { db, fetchFn: ok, now: new Date("2026-11-05T10:00:00Z") });
    await db.insertOutbox({ id: "ob1", envId: a.envId, accountId: "a1", idempotencyKey: "k", requestHash: "h", status: "failed", attempts: 5, sendAt: new Date(), nextAttemptAt: null, payloadEnc: null, result: null, error: "smtp_not_configured", createdAt: new Date("2026-11-05T11:00:00Z"), updatedAt: new Date(), expireAt: new Date("2026-12-01") });
    const t = buildTimeline(a, await db.listDeliveries("org_1"), await db.listOutbox([a.envId], 10), new Date("2026-11-05T12:00:00Z"));
    const kinds = t.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["connected", "event", "send", "watch", "state"]));
    expect(t[0]!.at >= t[t.length - 1]!.at).toBe(true);
    expect(t.find((x) => x.kind === "send")).toMatchObject({ title: "Send failed", detail: "smtp_not_configured" });
  });
});

describe("live SSE stream", () => {
  let db: Db;
  beforeEach(() => { db = newDb(); });
  const decode = async (s: ReadableStream<Uint8Array>) => {
    const r = s.getReader();
    let text = "";
    for (;;) { const { value, done } = await r.read(); if (done) break; text += new TextDecoder().decode(value); }
    return text;
  };
  const frames = (t: string) => t.split("\n\n").filter((f) => f.includes("event:")).map((f) => ({ event: /event: (\w+)/.exec(f)![1], data: JSON.parse(/data: (.*)/.exec(f)![1]!), id: /id: (.*)/.exec(f)?.[1] }));

  it("sends a snapshot first, then lines on a state change and ticker on a new event, then ends so the browser reconnects", async () => {
    await line(db, "a1");
    await endpoint(db);
    let tick = 0;
    const sleep = async () => {
      tick++;
      if (tick === 1) await db.updateAccount("a1", { state: "authenticationError", lastError: "invalid_grant" });
      if (tick === 2) await emitEvent("org_1", "accountError", { accountId: "a1" }, { db, fetchFn: ok, now: new Date(Date.now() + 1000) });
    };
    const text = await decode(createLiveStream({ db, orgId: "org_1", intervalMs: 1, maxMs: 4, sleep }));
    expect(text.startsWith("retry: ")).toBe(true);
    const f = frames(text);
    expect(f[0]!.event).toBe("snapshot");
    expect(f[0]!.data.lines[0]).toMatchObject({ id: "a1", lamp: "live" });
    const lines = f.find((x) => x.event === "lines");
    expect(lines!.data[0]).toMatchObject({ state: "authenticationError", lamp: "error" });
    expect(lines!.data[0].explanation.fix).toMatch(/connect link/);
    const ticker = f.find((x) => x.event === "ticker");
    expect(ticker!.data).toMatchObject({ type: "accountError", accountId: "a1" });
    expect(ticker!.id).toBe(ticker!.data.at);
    expect(text).toContain(": ping");
  });

  it("a reconnect with Last-Event-ID replays only newer events", async () => {
    await line(db, "a1");
    await endpoint(db);
    await emitEvent("org_1", "messageNew", { accountId: "a1" }, { db, fetchFn: ok, now: new Date("2026-11-05T10:00:00Z") });
    await emitEvent("org_1", "messageMoved", { accountId: "a1" }, { db, fetchFn: ok, now: new Date("2026-11-05T10:01:00Z") });
    const text = await decode(createLiveStream({ db, orgId: "org_1", intervalMs: 1, maxMs: 1, lastEventAt: "2026-11-05T10:00:30.000Z", sleep: async () => {} }));
    const t = frames(text).filter((x) => x.event === "ticker");
    expect(t.map((x) => x.data.type)).toEqual(["messageMoved"]);
  });

  it("stops when the client aborts and does not leak other orgs' events", async () => {
    await line(db, "a1");
    const ac = new AbortController();
    const s = createLiveStream({ db, orgId: "org_other", signal: ac.signal, intervalMs: 5, maxMs: 10_000 });
    const reader = s.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("retry:");
    const snap = await reader.read();
    expect(JSON.parse(/data: (.*)/.exec(new TextDecoder().decode(snap.value))![1]!).lines).toEqual([]);
    ac.abort();
    expect((await reader.read()).done).toBe(true);
  });

  it("snapshot() backs the polling fallback with the same shape", async () => {
    await line(db, "a1");
    expect(await snapshot(db, "org_1")).toMatchObject({ lines: [{ id: "a1" }], events: [] });
  });
});

describe("/metrics", () => {
  it("renders valid Prometheus text with zero-filled known states and escaped labels", () => {
    const text = renderMetrics({ accounts: { connected: 3, weird: 1 }, outbox: { sent: 7 }, deliveries: { failed: 2 }, version: 'v"1\n', uptimeSeconds: 12.4, now: new Date(1_800_000_000_000) });
    expect(text).toContain("# TYPE inboxwire_accounts gauge");
    expect(text).toContain('inboxwire_accounts{state="connected"} 3');
    expect(text).toContain('inboxwire_accounts{state="authenticationError"} 0');
    expect(text).toContain('inboxwire_accounts{state="weird"} 1');
    expect(text).toContain('inboxwire_outbox_items{status="sent"} 7');
    expect(text).toContain('inboxwire_webhook_deliveries{status="failed"} 2');
    expect(text).toContain('inboxwire_build_info{version="v\\"1\\n"} 1');
    expect(text).toContain("inboxwire_process_uptime_seconds 12");
    expect(text).toContain("inboxwire_scrape_timestamp_seconds 1800000000");
    expect(text.endsWith("\n")).toBe(true);
    for (const l of text.split("\n").filter((x) => x && !x.startsWith("#"))) expect(l).toMatch(/^[a-z_]+(\{[^}]*\})? -?\d+(\.\d+)?$/);
  });

  it("collects real counts from the Db", async () => {
    const db = newDb();
    await line(db, "a1");
    await line(db, "a2", "authenticationError");
    await endpoint(db);
    await emitEvent("org_1", "messageNew", {}, { db, fetchFn: ok });
    const text = await collectMetrics(db, "9.9.9");
    expect(text).toContain('inboxwire_accounts{state="connected"} 1');
    expect(text).toContain('inboxwire_accounts{state="authenticationError"} 1');
    expect(text).toContain('inboxwire_webhook_deliveries{status="succeeded"} 1');
    expect(text).toContain('version="9.9.9"');
  });

  describe("route auth", () => {
    beforeEach(() => { vi.resetModules(); vi.doMock("@/lib/db", () => ({ getDb: async () => newDb() })); });
    const get = async (headers: Record<string, string> = {}) => (await import("@/app/metrics/route")).GET(new Request("http://localhost/metrics", { headers }));
    it("needs the bearer token when METRICS_TOKEN is set", async () => {
      vi.stubEnv("METRICS_TOKEN", "s3cret");
      expect((await get()).status).toBe(401);
      expect((await get({ authorization: "Bearer nope" })).status).toBe(401);
      const r = await get({ authorization: "Bearer s3cret" });
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/plain; version=0.0.4");
      expect(await r.text()).toContain("inboxwire_up 1");
      vi.unstubAllEnvs();
    });
    it("is closed in production without a token and open in development", async () => {
      vi.stubEnv("METRICS_TOKEN", "");
      vi.stubEnv("NODE_ENV", "production");
      expect((await get()).status).toBe(404);
      vi.stubEnv("NODE_ENV", "development");
      expect((await get()).status).toBe(200);
      vi.unstubAllEnvs();
    });
  });
});
