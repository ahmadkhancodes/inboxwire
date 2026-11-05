import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";
import { snapshot } from "@/lib/live/lines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polling fallback for the live dashboard (used when EventSource is unavailable or keeps failing). */
export const GET = withApi(async () => {
  const ctx = await requireOrg();
  requirePermission(ctx, "apiKey", "read");
  return json(await snapshot(await getDb(), ctx.org.id));
});
