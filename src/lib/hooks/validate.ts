import { createPublicKey, createVerify } from "node:crypto";
import { safeEqual } from "@/lib/ids";
import { hookToken } from "@/lib/secrets";

// Inbound provider hook validation. Everything is pure or takes injected key fetchers: no network in tests.

export type JwkFetcher = (kid: string) => Promise<JsonWebKey | null>;

let certCache: { at: number; keys: (JsonWebKey & { kid?: string })[] } | null = null;
/** Google's public signing keys (cached 1 h). */
export const googleJwks: JwkFetcher = async (kid) => {
  if (!certCache || Date.now() - certCache.at > 3_600_000) {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!r.ok) return null;
    certCache = { at: Date.now(), keys: ((await r.json()) as { keys: (JsonWebKey & { kid?: string })[] }).keys };
  }
  return certCache.keys.find((k) => k.kid === kid) ?? null;
};

/** Verifies the OIDC bearer Pub/Sub attaches to push requests: RS256 signature, issuer, expiry, audience, service account. */
export async function verifyPubsubJwt(
  jwt: string,
  expect: { audience: string; serviceAccount: string },
  getKey: JwkFetcher = googleJwks,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const [h, p, sig] = jwt.split(".");
  if (!h || !p || !sig) return false;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
    const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean };
    if (header.alg !== "RS256" || !header.kid) return false;
    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return false;
    if (!claims.exp || claims.exp < now) return false;
    if (claims.aud !== expect.audience) return false;
    if (!claims.email_verified || claims.email?.toLowerCase() !== expect.serviceAccount.toLowerCase()) return false;
    const jwk = await getKey(header.kid);
    if (!jwk) return false;
    return createVerify("RSA-SHA256").update(`${h}.${p}`).verify(createPublicKey({ key: jwk as import("node:crypto").JsonWebKey, format: "jwk" }), Buffer.from(sig, "base64url"));
  } catch {
    return false;
  }
}

export type GmailPush = { emailAddress: string; historyId: string };
export type HookResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 401 | 403; error: string };

/** Gmail Pub/Sub push: `?token=` must match the per-env token; OIDC JWT required when a service account is configured. */
export async function validateGmailPush(
  p: { envId: string; url: URL; authorization: string | null; body: unknown; serviceAccount?: string | null; audience: string },
  getKey?: JwkFetcher,
): Promise<HookResult<GmailPush>> {
  const token = p.url.searchParams.get("token") ?? "";
  if (!safeEqual(token, hookToken(p.envId))) return { ok: false, status: 401, error: "invalid_token" };
  if (p.serviceAccount) {
    const jwt = p.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (!jwt || !(await verifyPubsubJwt(jwt, { audience: p.audience, serviceAccount: p.serviceAccount }, getKey))) return { ok: false, status: 401, error: "invalid_jwt" };
  }
  const data = (p.body as { message?: { data?: string } } | null)?.message?.data;
  if (typeof data !== "string") return { ok: false, status: 400, error: "bad_message" };
  try {
    const m = JSON.parse(Buffer.from(data, "base64").toString()) as Partial<GmailPush>;
    if (!m.emailAddress || m.historyId === undefined) return { ok: false, status: 400, error: "bad_message" };
    return { ok: true, value: { emailAddress: m.emailAddress.toLowerCase(), historyId: String(m.historyId) } };
  } catch {
    return { ok: false, status: 400, error: "bad_message" };
  }
}

export interface GraphNotification { subscriptionId: string; clientState?: string; changeType?: string; lifecycleEvent?: string; resource?: string }

/** Graph notifications: every item's clientState must match; items failing it are dropped, and none valid = 401. */
export function validateGraphNotifications(envId: string, body: unknown): HookResult<GraphNotification[]> {
  const list = (body as { value?: GraphNotification[] } | null)?.value;
  if (!Array.isArray(list) || !list.length) return { ok: false, status: 400, error: "bad_payload" };
  const expected = hookToken(envId);
  const good = list.filter((n) => typeof n.subscriptionId === "string" && typeof n.clientState === "string" && safeEqual(n.clientState, expected));
  if (!good.length) return { ok: false, status: 401, error: "invalid_client_state" };
  return { ok: true, value: good };
}
