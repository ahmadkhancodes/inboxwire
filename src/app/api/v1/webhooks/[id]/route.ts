import { audit } from "@/lib/audit";
import { HttpError, json, readJson } from "@/lib/http";
import { isSafeWebhookUrl } from "@/lib/webhooks/outbound";
import { endpointView, WebhookPatchBody } from "@/lib/v1/schemas";
import { v1, type V1Ctx } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function mine({ db, orgId, env }: V1Ctx, id: string) {
  const ep = await db.getWebhookEndpoint(orgId, id);
  if (!ep || ep.envId !== env.id) throw new HttpError(404, "not_found");
  return ep;
}

export const GET = v1<Ctx>("admin", async (a, _req, { params }) => json(endpointView(await mine(a, (await params).id))));

/** `PATCH /v1/webhooks/{id}`: change url, event allowlist or `enabled`. Turning an endpoint back on clears its failure clock. */
export const PATCH = v1<Ctx>("admin", async (a, req, { params }) => {
  const ep = await mine(a, (await params).id);
  const body = await readJson(req, WebhookPatchBody);
  if (body.url && !isSafeWebhookUrl(body.url)) throw new HttpError(400, "unsafe_url");
  await a.db.updateWebhookEndpoint(a.orgId, ep.id, { ...body, ...(body.enabled ? { failingSince: null, disabledAt: null, disabledReason: null } : {}) });
  await audit({ orgId: a.orgId, actorId: `key:${a.keyId}`, action: "webhook.updated", target: ep.id });
  return json(endpointView((await a.db.getWebhookEndpoint(a.orgId, ep.id))!));
});

export const DELETE = v1<Ctx>("admin", async (a, _req, { params }) => {
  const ep = await mine(a, (await params).id);
  await a.db.deleteWebhookEndpoint(a.orgId, ep.id);
  await audit({ orgId: a.orgId, actorId: `key:${a.keyId}`, action: "webhook.deleted", target: ep.id });
  return json({ deleted: true });
});
