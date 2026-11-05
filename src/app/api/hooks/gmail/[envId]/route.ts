import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";
import { handleGmailHook } from "@/lib/hooks/handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withApi(async (req, { params }: { params: Promise<{ envId: string }> }) => {
  const body = await req.json().catch(() => null);
  const r = await handleGmailHook(await getDb(), (await params).envId, { url: req.url, authorization: req.headers.get("authorization"), body });
  return json(r.body, r.status);
}, { csrf: false });
