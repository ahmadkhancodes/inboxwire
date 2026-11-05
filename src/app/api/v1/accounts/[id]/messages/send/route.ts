import { after } from "next/server";
import { json, readJson } from "@/lib/http";
import { enqueueSend, processOutbox } from "@/lib/send/outbox";
import { outboxView, SendBodySchema } from "@/lib/v1/schemas";
import { loadAccount, v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * `POST /v1/accounts/{id}/messages/send`: queues the message and answers 202 with the queue id.
 * With an `Idempotency-Key` header a repeat (7 days) returns the same id and `Idempotent-Replayed: true` instead of sending again.
 */
export const POST = v1<Ctx>("send", async ({ db, env }, req, { params }) => {
  const account = await loadAccount(db, env, (await params).id);
  const body = await readJson(req, SendBodySchema);
  const { item, replayed } = await enqueueSend(db, { envId: env.id, accountId: account.id, request: body, idempotencyKey: req.headers.get("idempotency-key") });
  if (!replayed) after(() => processOutbox(db, item.id).then(() => undefined, () => undefined));
  return json(outboxView(item), 202, { location: `/v1/outbox/${item.id}`, ...(replayed ? { "idempotent-replayed": "true" } : {}) });
});
