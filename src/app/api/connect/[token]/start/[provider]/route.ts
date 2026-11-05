import { NextResponse } from "next/server";
import { assertLink, lookupConnectLink } from "@/lib/connect/links";
import { buildAuthUrl, newOAuthState, pkcePair, redirectUri } from "@/lib/connect/oauth";
import { getDb } from "@/lib/db";
import type { OAuthProvider } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { HttpError, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Begins OAuth with the customer's BYO client: stores state + PKCE verifier on the link, redirects to the provider. */
export const GET = withApi(async (req, { params }: { params: Promise<{ token: string; provider: string }> }) => {
  const { token, provider } = await params;
  if (provider !== "google" && provider !== "microsoft") throw new HttpError(404, "unknown_provider");
  const db = await getDb();
  const link = assertLink(await lookupConnectLink(db, token));
  const client = await db.getOAuthClient(link.envId, provider as OAuthProvider);
  if (!client) throw new HttpError(409, "oauth_client_missing");
  const { state, stateHash } = await newOAuthState();
  const { verifier, challenge } = await pkcePair();
  const email = new URL(req.url).searchParams.get("email") ?? link.email ?? null;
  await db.setConnectLinkOAuth(link.id, { stateHash, verifier, provider: provider as OAuthProvider, email });
  return NextResponse.redirect(buildAuthUrl(provider as OAuthProvider, { clientId: client.clientId, redirectUri: redirectUri(appUrl(), provider as OAuthProvider), state, challenge, loginHint: email }));
}, { csrf: false });
