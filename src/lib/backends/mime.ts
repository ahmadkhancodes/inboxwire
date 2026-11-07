import { randomBytes } from "node:crypto";
import type { Address, SendRequest } from "@/lib/mailcore";

const addr = (a: Address) => (a.name ? `"${a.name.replace(/["\r\n]/g, "")}" <${a.address}>` : a.address);
const header = (v: string) => (/[^\x20-\x7e]/.test(v) ? `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=` : v.replace(/[\r\n]/g, " "));

/** Minimal RFC 5322 builder for Gmail `raw` sends. References/In-Reply-To keep replies threaded. */
export function buildRfc822(from: string, req: SendRequest, opts: { inReplyTo?: string; references?: string } = {}): string {
  const lines = [`From: ${from}`, `To: ${req.to.map(addr).join(", ")}`];
  if (req.cc?.length) lines.push(`Cc: ${req.cc.map(addr).join(", ")}`);
  if (req.bcc?.length) lines.push(`Bcc: ${req.bcc.map(addr).join(", ")}`);
  lines.push(`Subject: ${header(req.subject ?? "")}`, `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0");
  // Message-ID/References come from a received (attacker-controlled) message: strip CR/LF so they cannot add headers.
  const oneLine = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${oneLine(opts.inReplyTo)}`, `References: ${oneLine(opts.references ?? opts.inReplyTo)}`);
  const b64 = (s: string) => Buffer.from(s).toString("base64").replace(/.{76}/g, "$&\r\n");
  if (req.html && req.text) {
    const boundary = `iw_${randomBytes(12).toString("hex")}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, "",
      `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(req.text),
      `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(req.html), `--${boundary}--`);
  } else {
    lines.push(`Content-Type: ${req.html ? "text/html" : "text/plain"}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", b64(req.html ?? req.text ?? ""));
  }
  return lines.join("\r\n");
}
