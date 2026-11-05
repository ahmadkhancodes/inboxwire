import type { Db, OAuthProvider } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { sha256 } from "@/lib/ids";
import { openForOrg, orgOfEnv } from "@/lib/secrets";
import { completeOAuth, type CompleteDeps } from "./complete";
import { exchangeCode, redirectUri, resolveEmail } from "./oauth";

/** Handles `/api/connect/callback/<provider>?code&state`. State must match an in-flight link of the SAME provider; it is single use. */
export async function handleOAuthCallback(db: Db, provider: OAuthProvider, q: { code?: string | null; state?: string | null; error?: string | null }, appBase: string, deps: CompleteDeps & { fetchFn?: typeof fetch } = {}) {
  if (!q.state) throw new HttpError(400, "missing_state");
  const link = await db.getConnectLinkByState(await sha256(q.state));
  if (!link?.oauth || link.oauth.provider !== provider) throw new HttpError(400, "invalid_state");
  if (link.usedAt || link.expiresAt <= (deps.now ?? new Date())) throw new HttpError(410, "link_expired");
  if (q.error || !q.code) {
    await db.setConnectLinkOAuth(link.id, null); // burn the state, keep the link usable
    throw new HttpError(400, "oauth_denied", { reason: q.error ?? "no_code", redirectUrl: link.redirectUrl });
  }
  const client = await db.getOAuthClient(link.envId, provider);
  if (!client) throw new HttpError(409, "oauth_client_missing");
  const orgId = await orgOfEnv(db, link.envId);
  const tokens = await exchangeCode(provider, {
    clientId: client.clientId, clientSecret: await openForOrg(db, orgId, client.clientSecretEnc), code: q.code, verifier: link.oauth.verifier, redirectUri: redirectUri(appBase, provider),
  }, deps.fetchFn, deps.now).catch(() => { throw new HttpError(502, "token_exchange_failed"); });
  const email = await resolveEmail(provider, tokens, deps.fetchFn).catch(() => { throw new HttpError(502, "profile_failed"); });
  return completeOAuth(db, link, provider, tokens, email, deps);
}
