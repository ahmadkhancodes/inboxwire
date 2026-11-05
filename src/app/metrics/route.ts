import { getDb } from "@/lib/db";
import { safeEqual } from "@/lib/ids";
import { collectMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/metrics`: Prometheus text. Needs `Authorization: Bearer $METRICS_TOKEN`. With no token configured the endpoint is
 * closed (404) in production and open on a developer machine, so it is never public by accident.
 */
export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!safeEqual(given, token)) return new Response("unauthorized\n", { status: 401, headers: { "www-authenticate": "Bearer" } });
  } else if (process.env.NODE_ENV === "production") {
    return new Response("not found\n", { status: 404 });
  }
  try {
    return new Response(await collectMetrics(await getDb()), { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" } });
  } catch {
    return new Response("# inboxwire_up 0\ninboxwire_up 0\n", { status: 503, headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" } });
  }
}
