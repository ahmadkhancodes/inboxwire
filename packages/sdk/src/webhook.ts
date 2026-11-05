// Webhook signature: `Inboxwire-Signature: t=<unix seconds>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>` with the endpoint secret.
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

export async function signWebhook(secret: string, rawBody: string, t = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${t},v1=${await hmac(secret, `${t}.${rawBody}`)}`;
}

/** True when the header matches the raw body and is at most `toleranceSeconds` old (default 300). Pass the body exactly as received, before any JSON parsing. */
export async function verifyWebhook(secret: string, rawBody: string, header: string | null | undefined, opts: { toleranceSeconds?: number; now?: number } = {}): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300)) return false;
  const want = await hmac(secret, `${t}.${rawBody}`);
  if (want.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
