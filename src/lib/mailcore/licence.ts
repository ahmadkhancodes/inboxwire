import { createPublicKey, createPrivateKey, sign, verify, generateKeyPairSync } from 'node:crypto';
export interface LicencePayload { id: string; org: string; plan: 'selfhost' | 'enterprise'; issuedAt: number; expiresAt: number; features?: string[] }
const b64 = (b: Buffer) => b.toString('base64url');
export function generateKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string };
}
export function issue(privateKeyPem: string, payload: LicencePayload): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = sign(null, Buffer.from(body), createPrivateKey(privateKeyPem));
  return `IBW1.${body}.${b64(sig)}`;
}
export type LicenceStatus = { status: 'valid' | 'grace' | 'expired' | 'invalid'; payload?: LicencePayload; reason?: string };
const DAY = 86400, SKEW = DAY, GRACE = 30 * DAY;
export function check(publicKeyPem: string, key: string, now = Math.floor(Date.now() / 1000)): LicenceStatus {
  const [v, body, sig] = key.split('.');
  if (v !== 'IBW1' || !body || !sig) return { status: 'invalid', reason: 'malformed' };
  let ok = false;
  try { ok = verify(null, Buffer.from(body), createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url')); } catch { /* fallthrough */ }
  if (!ok) return { status: 'invalid', reason: 'bad signature' };
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as LicencePayload;
  if (now + SKEW < payload.issuedAt) return { status: 'invalid', payload, reason: 'issued in the future' };
  if (now <= payload.expiresAt + SKEW) return { status: 'valid', payload };
  if (now <= payload.expiresAt + GRACE) return { status: 'grace', payload, reason: 'expired: read-only banner' };
  return { status: 'expired', payload };
}
