import type { Operation } from "@/lib/openapi";

/** Sample bodies for the API reference curl commands. Executed against the app by tests/e2e/docs-run.spec.ts. */
export const SAMPLE_BODY: Record<string, string> = {
  sendMessage: '{"to":[{"address":"ana@example.com"}],"subject":"Hello","text":"Sent through Inboxwire"}',
  createWebhook: '{"url":"https://example.com/hooks/inboxwire"}',
  updateWebhook: '{"enabled":true}',
};

/** Placeholder ids shown on /docs/api, one per resource so a webhook id never looks like an account id. */
export interface SampleIds { account: string; message: string; attachment: string; outbox: string; webhook: string; delivery: string }
export const PLACEHOLDER_IDS: SampleIds = { account: "acc_123", message: "msg_456", attachment: "att_789", outbox: "out_123", webhook: "wh_123", delivery: "dlv_123" };

function idFor(path: string, ids: SampleIds): string {
  if (path.startsWith("/outbox")) return ids.outbox;
  if (path.startsWith("/webhooks")) return ids.webhook;
  if (path.startsWith("/deliveries")) return ids.delivery;
  return ids.account;
}

export function operationCurl(op: Pick<Operation, "id" | "method" | "path" | "idempotent" | "body">, base: string, ids: SampleIds = PLACEHOLDER_IDS) {
  const path = op.path.replace("{id}", idFor(op.path, ids)).replace("{mid}", ids.message).replace("{aid}", ids.attachment);
  const parts = [`curl ${op.method === "get" ? "" : `-X ${op.method.toUpperCase()} `}${base}/v1${path}`, `-H "Authorization: Bearer $INBOXWIRE_KEY"`];
  if (op.idempotent) parts.push(`-H "Idempotency-Key: order-1042-receipt"`);
  if (op.body) parts.push(`-H "Content-Type: application/json"`, `-d '${SAMPLE_BODY[op.id] ?? "{}"}'`);
  return parts.join(" \\\n  ");
}

/** Node signature check shown on /docs/api. Executed in tests/unit/docs-samples.test.ts. */
export const VERIFY_NODE = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret, rawBody, header) {
  const p = Object.fromEntries(header.split(",").map((x) => x.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false;
  const mac = createHmac("sha256", secret).update(p.t + "." + rawBody).digest();
  const given = Buffer.from(p.v1, "hex");
  return given.length === mac.length && timingSafeEqual(given, mac);
}`;
