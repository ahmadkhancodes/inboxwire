import { json } from "@/lib/http";
import { loadAccount, v1, withBackend } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; mid: string }> };

/** `GET /v1/accounts/{id}/messages/{mid}/attachments`: attachment metadata. */
export const GET = v1<Ctx>("read", async ({ db, env }, _req, { params }) => {
  const { id, mid } = await params;
  const account = await loadAccount(db, env, id);
  return json({ items: await withBackend(db, account, (b) => b.attachments(mid)) });
});
