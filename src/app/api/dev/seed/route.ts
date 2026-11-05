import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DELIVERY_TTL_DAYS, type WebhookDelivery } from "@/lib/db/types";
import { json, withApi } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E2E and screenshots only: seeds the signed-in org with lines, deliveries and sends. 404 unless E2E_OUTBOX=1 (never set on Vercel). */
export const POST = withApi(async () => {
  if (process.env.E2E_OUTBOX !== "1") return json({ error: "not_found" }, 404);
  const ctx = await requireOrg();
  const db = await getDb();
  const env = await db.ensureEnvironment(ctx.org.id, "production");
  const now = Date.now();
  const mk = async (email: string, provider: "google" | "microsoft" | "imap", state: "connected" | "syncing" | "throttled" | "authenticationError" | "connectError", mode: "push" | "polling", lastError: string | null = null) =>
    db.upsertAccount({ id: uuidv7(), envId: env.id, externalId: email, email, provider, backend: provider === "google" ? "gmail_api" : provider === "microsoft" ? "graph" : "imap", state, lastError, nextPollAt: null, mode });
  const lines = [
    await mk("ops@northwind-crm.example", "google", "connected", "push"),
    await mk("dana@harbor-law.example", "microsoft", "connected", "push"),
    await mk("intake@kestrel-ats.example", "imap", "syncing", "polling"),
    await mk("billing@tidewater.example", "microsoft", "throttled", "polling"),
    await mk("m.okafor@tidewater.example", "google", "authenticationError", "push", "invalid_grant"),
    await mk("support@alder-desk.example", "imap", "connectError", "polling", "ECONNREFUSED imap.alder-desk.example:993"),
  ];
  const ep = await db.createWebhookEndpoint({ id: uuidv7(), orgId: ctx.org.id, url: "https://hooks.northwind-crm.example/inboxwire", secret: "whsec_seed", events: ["*"], enabled: true, envId: env.id });
  const plan: [string, (typeof lines)[number], WebhookDelivery["status"], number | null, number | null][] = [
    ["messageNew", lines[0]!, "succeeded", 200, 84], ["messageMoved", lines[1]!, "succeeded", 200, 112], ["messageNew", lines[2]!, "failed", 500, 2041],
    ["messageSent", lines[0]!, "succeeded", 200, 97], ["accountError", lines[4]!, "retrying", 503, 3010], ["messageNew", lines[1]!, "succeeded", 200, 76], ["accountConnected", lines[5]!, "pending", null, null],
  ];
  let i = 0;
  for (const [type, a, status, code, ms] of plan) {
    const at = new Date(now - (plan.length - i++) * 47_000);
    const id = uuidv7();
    await db.createDelivery({
      id, eventId: id, orgId: ctx.org.id, envId: env.id, endpointId: ep.id, event: type, status, attempts: status === "pending" ? 0 : status === "failed" ? 8 : 1, nextAttemptAt: status === "retrying" ? new Date(now + 60_000) : null,
      lastStatusCode: code, lastError: status === "failed" ? "HTTP 500" : null, lastLatencyMs: ms, lastResponseSnippet: null, createdAt: at, updatedAt: at, expireAt: new Date(now + DELIVERY_TTL_DAYS * 864e5), app: db.app,
      payload: JSON.stringify({ id, type, created: Math.floor(at.getTime() / 1000), data: { accountId: a.id, email: a.email } }),
    } as WebhookDelivery);
  }
  const sends: [string, "queued" | "sending" | "sent" | "failed", number, string | null][] = [["order-1042", "sent", 1, null], ["order-1043", "queued", 0, null], ["digest-9", "failed", 5, "smtp_not_configured"]];
  for (const [key, status, attempts, error] of sends) {
    const at = new Date(now - 30_000 * (attempts + 1));
    await db.insertOutbox({ id: uuidv7(), envId: env.id, accountId: lines[0]!.id, idempotencyKey: key, requestHash: key, status, attempts, sendAt: at, nextAttemptAt: status === "queued" ? at : null, payloadEnc: null, result: status === "sent" ? { id: "msg_1" } : null, error, createdAt: at, updatedAt: at, expireAt: new Date(now + 6 * 864e5) });
  }
  return json({ lines: lines.map((l) => l.id) });
});
