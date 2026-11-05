import { audit } from "@/lib/audit";
import { json, readJson } from "@/lib/http";
import { replayFailed } from "@/lib/webhooks/outbound";
import { BulkReplayBody } from "@/lib/v1/schemas";
import { v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** `POST /v1/deliveries/replay`: bulk replay of failed deliveries (not replayed before), optionally for one endpoint. */
export const POST = v1("admin", async ({ db, orgId, env, keyId }, req) => {
  const body = await readJson(req, BulkReplayBody);
  const r = await replayFailed(orgId, { db, envId: env.id, endpointId: body.endpointId, limit: body.limit });
  await audit({ orgId, actorId: `key:${keyId}`, action: "webhook.replayed_bulk", meta: { replayed: r.replayed } });
  return json(r, 202);
});
