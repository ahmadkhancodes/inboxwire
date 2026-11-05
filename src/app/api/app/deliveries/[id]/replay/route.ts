import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { HttpError, json, withApi } from "@/lib/http";
import { deliveryView } from "@/lib/v1/schemas";
import { replayDelivery } from "@/lib/webhooks/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Dashboard replay button: re-sends one delivery (same event id). */
export const POST = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "webhook", "manage");
  const id = (await params).id;
  const r = await replayDelivery(ctx.org.id, id);
  if (!r.ok) throw new HttpError(r.reason === "endpoint_disabled" ? 409 : 404, r.reason);
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "webhook.replayed", target: id });
  return json(deliveryView(r.delivery), 202);
});
