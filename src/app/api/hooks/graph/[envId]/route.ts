import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";
import { handleGraphHook } from "@/lib/hooks/handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withApi(async (req, { params }: { params: Promise<{ envId: string }> }) => {
  const body = await req.json().catch(() => null);
  const r = await handleGraphHook(await getDb(), (await params).envId, { url: req.url, body });
  if (r.text !== undefined) return new Response(r.text, { status: r.status, headers: { "content-type": "text/plain" } });
  return json(r.body, r.status);
}, { csrf: false });
