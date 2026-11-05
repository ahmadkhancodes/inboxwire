import { json } from "@/lib/http";
import { accountView } from "@/lib/v1/schemas";
import { v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /v1/accounts`: connected mailboxes of the key's environment. */
export const GET = v1("read", async ({ db, env }) => json({ items: (await db.listAccounts(env.id)).map(accountView) }));
