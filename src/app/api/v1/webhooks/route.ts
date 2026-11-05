import { audit } from "@/lib/audit";
import { HttpError, json, readJson } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { isSafeWebhookUrl, newWebhookSecret } from "@/lib/webhooks/outbound";
import { endpointView, WebhookCreateBody } from "@/lib/v1/schemas";
import { v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENDPOINTS = 20;

/** `GET /v1/webhooks`: endpoints of the key's environment. */
export const GET = v1("admin", async ({ db, orgId, env }) =>
  json({ items: (await db.listWebhookEndpoints(orgId)).filter((e) => e.envId === env.id).map(endpointView) }));

/** `POST /v1/webhooks`: new endpoint. Subscribes to `messageNew` unless `events` says otherwise. The signing secret is shown once. */
export const POST = v1("admin", async ({ db, orgId, env, keyId }, req) => {
  const body = await readJson(req, WebhookCreateBody);
  if (!isSafeWebhookUrl(body.url)) throw new HttpError(400, "unsafe_url");
  if ((await db.listWebhookEndpoints(orgId)).filter((e) => e.envId === env.id).length >= MAX_ENDPOINTS) throw new HttpError(400, "too_many_endpoints");
  const secret = newWebhookSecret();
  const ep = await db.createWebhookEndpoint({ id: uuidv7(), orgId, envId: env.id, url: body.url, events: body.events, enabled: true, secret, failingSince: null });
  await audit({ orgId, actorId: `key:${keyId}`, action: "webhook.created", target: ep.id });
  return json({ ...endpointView(ep), secret }, 201);
});
