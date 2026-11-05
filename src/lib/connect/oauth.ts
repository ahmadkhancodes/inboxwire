import { b64url, randomToken, sha256 } from "@/lib/ids";
import type { OAuthProvider } from "@/lib/db/types";

// OAuth 2.0 authorization code + PKCE (S256) against the customer's BYO client. No network in this file except
// through the injected fetch, so tests mock providers completely.

export const SCOPES: Record<OAuthProvider, string[]> = {
  google: ["openid", "email", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"],
  microsoft: ["openid", "email", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"],
};

const ENDPOINTS: Record<OAuthProvider, { auth: string; token: string }> = {
  google: { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token" },
  microsoft: { auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token" },
};

export const redirectUri = (base: string, provider: OAuthProvider) => `${base.replace(/\/$/, "")}/api/connect/callback/${provider}`;

export async function pkcePair() {
  const verifier = randomToken(48);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

export async function newOAuthState() {
  const state = randomToken(24);
  return { state, stateHash: await sha256(state) };
}

export function buildAuthUrl(provider: OAuthProvider, p: { clientId: string; redirectUri: string; state: string; challenge: string; loginHint?: string | null }): string {
  const u = new URL(ENDPOINTS[provider].auth);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES[provider].join(" "));
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (p.loginHint) u.searchParams.set("login_hint", p.loginHint);
  if (provider === "google") { u.searchParams.set("access_type", "offline"); u.searchParams.set("prompt", "consent"); }
  else u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export interface TokenSet { accessToken: string; refreshToken: string | null; expiresAt: Date; idToken: string | null }

async function tokenCall(provider: OAuthProvider, body: Record<string, string>, fetchFn: typeof fetch, now: Date): Promise<TokenSet> {
  const res = await fetchFn(ENDPOINTS[provider].token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`oauth_${j.error ?? res.status}`);
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresAt: new Date(now.getTime() + (j.expires_in ?? 3600) * 1000), idToken: j.id_token ?? null };
}

export function exchangeCode(provider: OAuthProvider, p: { clientId: string; clientSecret: string; code: string; verifier: string; redirectUri: string }, fetchFn: typeof fetch = fetch, now = new Date()) {
  return tokenCall(provider, { grant_type: "authorization_code", code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri, code_verifier: p.verifier }, fetchFn, now);
}

export function refreshAccessToken(provider: OAuthProvider, p: { clientId: string; clientSecret: string; refreshToken: string }, fetchFn: typeof fetch = fetch, now = new Date()) {
  return tokenCall(provider, { grant_type: "refresh_token", refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret }, fetchFn, now);
}

/** Email of the signed-in mailbox: id_token claim (unsigned decode is fine: it came straight from the token endpoint over TLS), else Graph /me. */
export async function resolveEmail(provider: OAuthProvider, t: TokenSet, fetchFn: typeof fetch = fetch): Promise<string> {
  if (t.idToken) {
    try {
      const claims = JSON.parse(Buffer.from(t.idToken.split(".")[1] ?? "", "base64url").toString()) as { email?: string; preferred_username?: string };
      const e = claims.email ?? claims.preferred_username;
      if (e?.includes("@")) return e.toLowerCase();
    } catch { /* fall through */ }
  }
  const url = provider === "google" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${t.accessToken}` } });
  const j = (await res.json().catch(() => ({}))) as { email?: string; mail?: string; userPrincipalName?: string };
  const e = j.email ?? j.mail ?? j.userPrincipalName;
  if (!res.ok || !e) throw new Error("oauth_no_email");
  return e.toLowerCase();
}

const GOOGLE_ID = /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Wizard validation: shape of client id/secret per provider. Returns an error message or null. */
export function validateClientCredentials(provider: OAuthProvider, clientId: string, clientSecret: string): string | null {
  if (provider === "google" && !GOOGLE_ID.test(clientId)) return "A Google client id ends in .apps.googleusercontent.com.";
  if (provider === "microsoft" && !GUID.test(clientId)) return "A Microsoft application (client) id is a GUID like 00000000-0000-0000-0000-000000000000.";
  if (clientSecret.length < 8) return "The client secret looks too short.";
  return null;
}
