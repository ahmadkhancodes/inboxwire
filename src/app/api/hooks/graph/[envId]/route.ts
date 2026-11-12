import { getDb } from "@/lib/db";
import { HttpError, json, readBodyText, withApi } from "@/lib/http";
import { handleGraphHook } from "@/lib/hooks/handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withApi(async (req, { params }: { params: Promise<{ envId: string }> }) => {
  const body = await readBodyText(req, 256_000).then((t) => JSON.parse(t) as unknown).catch((e) => { if (e instanceof HttpError) throw e; return null; });
  const r = await handleGraphHook(await getDb(), (await params).envId, { url: req.url, body });
  if (r.text !== undefined) return new Response(r.text, { status: r.status, headers: { "content-type": "text/plain" } });
  return json(r.body, r.status);
}, { csrf: false });
