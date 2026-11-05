import { HttpError, json } from "@/lib/http";
import { outboxView } from "@/lib/v1/schemas";
import { v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** `GET /v1/outbox/{id}`: status of a queued send (queued, sending, sent, failed). */
export const GET = v1<Ctx>("read", async ({ db, env }, _req, { params }) => {
  const item = await db.getOutbox(env.id, (await params).id);
  if (!item) throw new HttpError(404, "not_found");
  return json(outboxView(item));
});
