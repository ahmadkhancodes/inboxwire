import { json } from "@/lib/http";
import { accountView } from "@/lib/v1/schemas";
import { loadAccount, v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = v1<Ctx>("read", async ({ db, env }, _req, { params }) => json(accountView(await loadAccount(db, env, (await params).id))));
