import { audit } from "@/lib/audit";
import { HttpError, json } from "@/lib/http";
import { replayDelivery } from "@/lib/webhooks/outbound";
import { deliveryView } from "@/lib/v1/schemas";
import { v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** `POST /v1/deliveries/{id}/replay`: re-sends the stored payload as a new delivery (same event id) and returns its first result. */
export const POST = v1<Ctx>("admin", async ({ db, orgId, env, keyId }, _req, { params }) => {
  const id = (await params).id;
  const orig = await db.getDelivery(orgId, id);
  if (!orig || orig.envId !== env.id) throw new HttpError(404, "not_found");
  const r = await replayDelivery(orgId, id, { db });
  if (!r.ok) throw new HttpError(r.reason === "endpoint_disabled" ? 409 : 404, r.reason);
  await audit({ orgId, actorId: `key:${keyId}`, action: "webhook.replayed", target: id });
  return json(deliveryView(r.delivery), 202);
});
