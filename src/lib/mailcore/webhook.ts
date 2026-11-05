import { createHmac, timingSafeEqual } from 'node:crypto';
/** Header value: t=<unix seconds>,v1=<hex hmac-sha256 of `${t}.${body}`> */
export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}
export function verify(secret: string, body: string, header: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
/** Retry schedule: exponential backoff, 24 h window; auto-disable after 72 h of continuous failure. */
export function nextRetryDelaySec(attempt: number): number | null {
  const delays = [30, 120, 600, 1800, 3600, 7200, 14400, 28800, 43200]; // cumulative > 24 h
  return attempt < delays.length ? delays[attempt]! : null;
}
export const AUTO_DISABLE_AFTER_MS = 72 * 3600 * 1000;
