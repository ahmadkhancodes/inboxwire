export type Discovery = { provider: 'google' | 'microsoft' | 'imap'; imap?: { host: string; port: number; secure: boolean }; smtp?: { host: string; port: number; secure: boolean } };
const GOOGLE = new Set(['gmail.com', 'googlemail.com']);
const MICROSOFT = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com']);
/** MX hosts reveal hosted Google Workspace / Microsoft 365 domains. */
export function classify(email: string, mxHosts: string[] = []): Discovery {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) throw new Error('invalid email');
  if (GOOGLE.has(domain)) return { provider: 'google' };
  if (MICROSOFT.has(domain)) return { provider: 'microsoft' };
  const mx = mxHosts.map((h) => h.toLowerCase());
  if (mx.some((h) => h.endsWith('.google.com') || h.endsWith('.googlemail.com'))) return { provider: 'google' };
  if (mx.some((h) => h.endsWith('.mail.protection.outlook.com'))) return { provider: 'microsoft' };
  return { provider: 'imap', imap: { host: `imap.${domain}`, port: 993, secure: true }, smtp: { host: `smtp.${domain}`, port: 465, secure: true } };
}
