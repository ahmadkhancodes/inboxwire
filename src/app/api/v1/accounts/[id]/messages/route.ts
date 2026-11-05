import { HttpError, json } from "@/lib/http";
import { search } from "@/lib/mailcore";
import { openCursor, sealCursor } from "@/lib/v1/cursor";
import { MessageListQuery } from "@/lib/v1/schemas";
import { loadAccount, v1, withBackend } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** `GET /v1/accounts/{id}/messages`: newest first, cursor pagination, unified `q` search translated per provider. */
export const GET = v1<Ctx>("read", async ({ db, env }, req, { params }) => {
  const account = await loadAccount(db, env, (await params).id);
  const parsed = MessageListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new HttpError(400, "invalid_input", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const { q, folder, limit, cursor } = parsed.data;
  if (q) {
    try { search.parseQuery(q); } catch (e) { throw new HttpError(400, "invalid_query", { message: (e as Error).message }); }
  }
  const scope = { accountId: account.id, folder, q };
  const raw = cursor ? openCursor(scope, cursor) : undefined;
  const page = await withBackend(db, account, (b) => b.listMessages({ folder, q, limit, cursor: raw }));
  return json({ items: page.items, ...(page.nextCursor ? { nextCursor: sealCursor(scope, page.nextCursor) } : {}) });
});
