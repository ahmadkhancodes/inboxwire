import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";
import { deliveriesCsv } from "@/lib/webhooks/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "webhook", "read");
  const endpointId = new URL(req.url).searchParams.get("endpointId") ?? undefined;
  const list = await (await getDb()).listDeliveries(ctx.org.id, { endpointId, limit: 100 });
  const rows = list.map(({ payload: _p, ...d }) => d);
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return new Response(deliveriesCsv(rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="inboxwire-deliveries-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  }
  return json({ deliveries: rows });
});
