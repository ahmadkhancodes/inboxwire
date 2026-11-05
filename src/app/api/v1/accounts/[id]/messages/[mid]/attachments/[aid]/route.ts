import { downloadName } from "@/lib/v1/download";
import { loadAccount, v1, withBackend } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; mid: string; aid: string }> };

/** `GET /v1/accounts/{id}/messages/{mid}/attachments/{aid}`: the bytes, always as a download. */
export const GET = v1<Ctx>("read", async ({ db, env }, _req, { params }) => {
  const { id, mid, aid } = await params;
  const account = await loadAccount(db, env, id);
  const a = await withBackend(db, account, (b) => b.attachment(mid, aid));
  return new Response(a.data as BodyInit, {
    headers: {
      "content-type": /^[\w.+-]+\/[\w.+-]+$/.test(a.contentType) ? a.contentType : "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${downloadName(a.filename)}`,
      "content-length": String(a.data.byteLength), "x-content-type-options": "nosniff", "cache-control": "no-store",
    },
  });
});
