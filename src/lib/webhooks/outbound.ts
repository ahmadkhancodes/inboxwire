import { getDb } from "@/lib/db";
import { DELIVERY_TTL_DAYS, type Db, type WebhookDelivery, type WebhookEndpoint } from "@/lib/db/types";
import { randomToken, uuidv7 } from "@/lib/ids";
import { webhook as mcWebhook } from "@/lib/mailcore";
import { product } from "@/config/product";

// Outbound webhooks: HMAC-SHA256 signed by mailcore `webhook.sign`, retries with exponential backoff, delivery log, replay, auto-disable.
// Header: `Inboxwire-Signature: t=<unix>,v1=<hex hmac of "t.body">` (also sent as X-Webhook-Signature), plus X-Webhook-Id / X-Webhook-Event.
// X-Webhook-Id is the event id and stays the same on a retry or replay, so receivers can dedupe.

export const MAX_ATTEMPTS = 8;
/** Backoff after attempt n (1-based): 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h (+-10% jitter). */
const BACKOFF_S = [30, 120, 600, 1800, 3600, 10800, 21600, 43200];
export function backoffMs(attempt: number, rand = Math.random): number {
  const base = BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)]! * 1000;
  return Math.round(base * (0.9 + rand() * 0.2));
}

export const newWebhookSecret = () => `whsec_${randomToken(24)}`;

export async function signPayload(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return mcWebhook.sign(secret, body, t);
}

/** For receivers and tests: verify a signature header with a 5 minute tolerance. */
export async function verifySignature(secret: string, body: string, header: string, now = Date.now(), toleranceS = 300) {
  return mcWebhook.verify(secret, body, header, toleranceS, Math.floor(now / 1000));
}

/** Every event type we emit (the allowlist a `/v1` endpoint may choose from). `*` is accepted by the dashboard kit routes only. */
export const EVENT_TYPES = ["messageNew", "messageMoved", "messageDeleted", "messageSent", "messageFailed", "accountConnected", "accountInitialized", "accountError"] as const;
export const DEFAULT_EVENTS: string[] = ["messageNew"];

type Notify = (orgId: string, ep: WebhookEndpoint, reason: string) => Promise<void>;
interface AttemptOpts { db: Db; fetchFn?: typeof fetch; now?: Date; notify?: Notify }

/** Queue an event to every enabled endpoint subscribed to it (or to "*"), and try once immediately. */
export async function emitEvent(orgId: string, event: string, data: unknown, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; envId?: string | null; notify?: Notify } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const eps = (await db.listWebhookEndpoints(orgId)).filter((e) => e.enabled && (!e.envId || e.envId === opts.envId) && (e.events.includes("*") || e.events.includes(event)));
  const out: WebhookDelivery[] = [];
  for (const ep of eps) {
    const id = uuidv7();
    const payload = JSON.stringify({ id, type: event, created: Math.floor(now.getTime() / 1000), data });
    const d: WebhookDelivery = {
      id, eventId: id, envId: opts.envId ?? null, app: db.app, orgId, endpointId: ep.id, event, payload, status: "pending", attempts: 0,
      nextAttemptAt: now, lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now,
      expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5),
    };
    await db.createDelivery(d);
    out.push(await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now, notify: opts.notify }));
  }
  return out;
}

export async function attemptDelivery(
  d: WebhookDelivery,
  ep: WebhookEndpoint,
  opts: AttemptOpts,
): Promise<WebhookDelivery> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetchFn ?? fetch;
  const attempts = d.attempts + 1;
  let code: number | null = null;
  let error: string | null = null;
  let snippet: string | null = null;
  const started = Date.now();
  try {
    const ctrl = AbortSignal.timeout(10_000);
    const sig = await signPayload(ep.secret, d.payload, Math.floor(now.getTime() / 1000));
    const res = await fetchFn(ep.url, {
      method: "POST",
      signal: ctrl,
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "user-agent": `${product.name}-Webhooks/1.0`,
        "x-webhook-id": d.eventId ?? d.id,
        "x-webhook-event": d.event,
        "x-webhook-signature": sig,
        "inboxwire-signature": sig,
      },
      body: d.payload,
    });
    code = res.status;
    if (!res.ok) error = `http_${res.status}`;
    snippet = (await res.text().catch(() => "")).slice(0, 300) || null;
  } catch (e) {
    error = (e as Error).name === "TimeoutError" ? "timeout" : "network_error";
  }
  const ok = !error;
  const latency = Math.max(0, Date.now() - started);
  const patch: Partial<WebhookDelivery> = {
    attempts,
    lastLatencyMs: latency,
    lastResponseSnippet: snippet,
    lastStatusCode: code,
    lastError: error,
    updatedAt: now,
    status: ok ? "succeeded" : attempts >= MAX_ATTEMPTS ? "failed" : "retrying",
    nextAttemptAt: ok || attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + backoffMs(attempts)),
  };
  await opts.db.updateDelivery(d.id, patch);
  await trackEndpointHealth(ep, ok, now, opts);
  return { ...d, ...patch };
}

/** `failingSince` marks the start of a run of failures; 72 h of it disables the endpoint and emails the org owners. A success clears it. */
async function trackEndpointHealth(ep: WebhookEndpoint, ok: boolean, now: Date, opts: AttemptOpts) {
  if (ok) {
    if (ep.failingSince) await opts.db.updateWebhookEndpoint(ep.orgId, ep.id, { failingSince: null });
    return;
  }
  const since = ep.failingSince ?? now;
  if (!ep.failingSince) await opts.db.updateWebhookEndpoint(ep.orgId, ep.id, { failingSince: since });
  if (ep.enabled && now.getTime() - since.getTime() >= mcWebhook.AUTO_DISABLE_AFTER_MS) {
    const reason = "72 hours of failed deliveries";
    await opts.db.updateWebhookEndpoint(ep.orgId, ep.id, { enabled: false, disabledAt: now, disabledReason: reason });
    await opts.db.appendAudit({ orgId: ep.orgId, actorId: null, action: "webhook.auto_disabled", target: ep.id, at: now });
    const notify = opts.notify ?? (await import("./notify")).notifyEndpointDisabled;
    await notify(ep.orgId, ep, reason).catch(() => {});
  }
}

export type ReplayResult = { ok: true; delivery: WebhookDelivery } | { ok: false; reason: "not_found" | "endpoint_disabled" };

/** One-click replay: re-sends the stored payload as a new delivery (same event id) and marks the original as replayed. */
export async function replayDelivery(orgId: string, id: string, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; notify?: Notify } = {}): Promise<ReplayResult> {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const orig = await db.getDelivery(orgId, id);
  if (!orig) return { ok: false, reason: "not_found" };
  const ep = await db.getWebhookEndpoint(orgId, orig.endpointId);
  if (!ep) return { ok: false, reason: "not_found" };
  if (!ep.enabled) return { ok: false, reason: "endpoint_disabled" };
  const nid = uuidv7();
  const d: WebhookDelivery = {
    ...orig, id: nid, eventId: orig.eventId ?? orig.id, replayOf: orig.id, replayedAt: null, status: "pending", attempts: 0, nextAttemptAt: now,
    lastStatusCode: null, lastError: null, lastLatencyMs: null, lastResponseSnippet: null, createdAt: now, updatedAt: now,
    expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5),
  };
  await db.createDelivery(d);
  await db.updateDelivery(orig.id, { replayedAt: now, updatedAt: now });
  return { ok: true, delivery: await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now, notify: opts.notify }) };
}

/** Bulk replay of deliveries that ran out of retries (`failed`) and were not replayed yet, optionally for one endpoint. */
export async function replayFailed(orgId: string, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; endpointId?: string; envId?: string | null; limit?: number; notify?: Notify } = {}) {
  const db = opts.db ?? (await getDb());
  const list = await db.listDeliveries(orgId, { endpointId: opts.endpointId, limit: 500 });
  const todo = list.filter((d) => d.status === "failed" && !d.replayedAt && (!opts.envId || d.envId === opts.envId)).slice(0, opts.limit ?? 100);
  const out = { replayed: 0, succeeded: 0, skipped: 0 };
  for (const d of todo.reverse()) {
    const r = await replayDelivery(orgId, d.id, opts);
    if (!r.ok) { out.skipped++; continue; }
    out.replayed++;
    if (r.delivery.status === "succeeded") out.succeeded++;
  }
  return out;
}

/** Cron job: retry due deliveries. */
export async function retryDueDeliveries(opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; limit?: number; notify?: Notify } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const due = await db.dueDeliveries(now, opts.limit ?? 50);
  let ok = 0;
  for (const d of due) {
    const ep = await db.getWebhookEndpoint(d.orgId, d.endpointId);
    if (!ep || !ep.enabled) {
      await db.updateDelivery(d.id, { status: "failed", lastError: "endpoint_disabled", nextAttemptAt: null, updatedAt: now });
      continue;
    }
    const r = await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now, notify: opts.notify });
    if (r.status === "succeeded") ok++;
  }
  return { processed: due.length, succeeded: ok };
}

/** Block private/loopback targets (SSRF) for user-supplied webhook URLs. */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h.startsWith("[") || h === "::1") return false;
  return true;
}
