import { json } from "@/lib/http";
import { checkHealth } from "@/lib/ops/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health: real dependency state, no details. Always 200 so a container HEALTHCHECK does not restart the
 * app because Mongo is down (restarting does not fix it); monitors that want a failing status use `?strict=1`.
 */
export async function GET(req: Request) {
  const h = await checkHealth();
  const strict = new URL(req.url).searchParams.get("strict") === "1";
  return json(h, strict && !h.ok ? 503 : 200);
}
