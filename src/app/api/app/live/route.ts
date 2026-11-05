import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { HttpError, withApi } from "@/lib/http";
import { createLiveStream } from "@/lib/live/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dashboard SSE: `snapshot` once, then `lines` on a state change and `ticker` per new event. Reconnects send Last-Event-ID. */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "apiKey", "read");
  const db = await getDb();
  if (!req.signal) throw new HttpError(400, "no_signal");
  const stream = createLiveStream({ db, orgId: ctx.org.id, signal: req.signal, lastEventAt: req.headers.get("last-event-id") });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
});
