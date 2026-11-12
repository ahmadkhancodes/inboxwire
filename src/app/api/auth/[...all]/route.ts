import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guardAuthMail } from "@/lib/security/auth-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = async (req: Request) => (await guardAuthMail(req, await getDb())) ?? (await getAuth()).handler(req);
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(handler);
