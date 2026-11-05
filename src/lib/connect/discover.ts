import { promises as dns } from "node:dns";
import { classify, type Discovery } from "@/lib/mailcore";

/** Thunderbird ISPDB-style static hints for big IMAP hosts whose `imap.<domain>` guess would be wrong. */
const KNOWN: Record<string, Pick<Discovery, "imap" | "smtp">> = {
  "yahoo.com": { imap: { host: "imap.mail.yahoo.com", port: 993, secure: true }, smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true } },
  "icloud.com": { imap: { host: "imap.mail.me.com", port: 993, secure: true }, smtp: { host: "smtp.mail.me.com", port: 587, secure: false } },
  "me.com": { imap: { host: "imap.mail.me.com", port: 993, secure: true }, smtp: { host: "smtp.mail.me.com", port: 587, secure: false } },
  "fastmail.com": { imap: { host: "imap.fastmail.com", port: 993, secure: true }, smtp: { host: "smtp.fastmail.com", port: 465, secure: true } },
  "zoho.com": { imap: { host: "imap.zoho.com", port: 993, secure: true }, smtp: { host: "smtp.zoho.com", port: 465, secure: true } },
  "gmx.com": { imap: { host: "imap.gmx.com", port: 993, secure: true }, smtp: { host: "mail.gmx.com", port: 587, secure: false } },
};

export interface Resolver { resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>; resolveSrv(name: string): Promise<{ name: string; port: number }[]> }

export async function discover(email: string, resolver: Resolver = dns): Promise<Discovery> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) throw new Error("invalid email");
  const mx = await resolver.resolveMx(domain).then((r) => r.sort((a, b) => a.priority - b.priority).map((m) => m.exchange.replace(/\.$/, ""))).catch(() => [] as string[]);
  const d = classify(email, mx);
  if (d.provider !== "imap") return d;
  const known = KNOWN[domain];
  if (known) return { provider: "imap", ...known };
  // RFC 6186 SRV records, when the domain publishes them.
  const imapSrv = await resolver.resolveSrv(`_imaps._tcp.${domain}`).then((r) => r[0]).catch(() => undefined);
  const subSrv = await resolver.resolveSrv(`_submissions._tcp.${domain}`).then((r) => r[0]).catch(() => undefined);
  return {
    provider: "imap",
    imap: imapSrv?.name ? { host: imapSrv.name.replace(/\.$/, ""), port: imapSrv.port, secure: true } : d.imap,
    smtp: subSrv?.name ? { host: subSrv.name.replace(/\.$/, ""), port: subSrv.port, secure: subSrv.port === 465 } : d.smtp,
  };
}
