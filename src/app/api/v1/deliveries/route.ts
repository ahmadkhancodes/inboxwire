import { HttpError, json } from "@/lib/http";
import { deliveryView, DeliveryListQuery } from "@/lib/v1/schemas";
import { v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /v1/deliveries`: the delivery log, newest first, with status code and latency of the last attempt. */
export const GET = v1("admin", async ({ db, orgId, env }, req) => {
  const q = DeliveryListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) throw new HttpError(400, "invalid_input", q.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const list = await db.listDeliveries(orgId, { endpointId: q.data.endpointId, limit: 500 });
  return json({ items: list.filter((d) => d.envId === env.id && (!q.data.status || d.status === q.data.status)).slice(0, q.data.limit).map(deliveryView) });
});
