import { z } from "zod";
import { HttpError, json } from "@/lib/http";
import { loadAccount, v1, withBackend } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; mid: string }> };
const Format = z.enum(["json", "raw"]).default("json");

/** `GET /v1/accounts/{id}/messages/{mid}?format=json|raw`: metadata as JSON, or the original RFC 822 source. */
export const GET = v1<Ctx>("read", async ({ db, env }, req, { params }) => {
  const { id, mid } = await params;
  const account = await loadAccount(db, env, id);
  const f = Format.safeParse(new URL(req.url).searchParams.get("format") ?? undefined);
  if (!f.success) throw new HttpError(400, "invalid_input", [{ path: "format", message: "json or raw" }]);
  const msg = await withBackend(db, account, (b) => b.getMessage(mid, f.data));
  if (f.data === "json") return json(msg);
  if (msg == null) throw new HttpError(404, "not_found");
  return new Response(msg as BodyInit, { headers: { "content-type": "message/rfc822", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
});
