import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/connect/callback";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { HttpError, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = withApi(async (req, { params }: { params: Promise<{ provider: string }> }) => {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") throw new HttpError(404, "unknown_provider");
  const q = new URL(req.url).searchParams;
  try {
    const r = await handleOAuthCallback(await getDb(), provider, { code: q.get("code"), state: q.get("state"), error: q.get("error") }, appUrl());
    return NextResponse.redirect(r.redirectUrl ?? `${appUrl()}/connect/done?email=${encodeURIComponent(r.email)}`);
  } catch (e) {
    if (e instanceof HttpError && e.code === "oauth_denied") return NextResponse.redirect(`${appUrl()}/connect/done?error=denied`);
    throw e;
  }
}, { csrf: false });
