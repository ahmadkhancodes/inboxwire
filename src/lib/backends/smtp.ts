import type { Address, SendRequest } from "@/lib/mailcore";
import type { SmtpSend } from "./imap";

export interface SmtpSettings { host: string; port: number; secure: boolean; user: string; pass: string }

/** The slice of nodemailer's transporter we use; tests pass a fake. */
export interface SmtpTransportLike {
  sendMail(o: { from: string; to: string[]; cc?: string[]; bcc?: string[]; subject?: string; text?: string; html?: string; inReplyTo?: string; references?: string[] }): Promise<{ messageId: string }>;
  close(): void;
}
export type SmtpTransportFactory = (s: SmtpSettings) => SmtpTransportLike;

/** Real factory. Lazy import keeps nodemailer out of bundles that never send over SMTP. Port 587 style servers use STARTTLS (`secure: false` + requireTLS). */
export const nodemailerFactory: SmtpTransportFactory = (s) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nm = require("nodemailer") as typeof import("nodemailer");
  return nm.createTransport({ host: s.host, port: s.port, secure: s.secure, requireTLS: !s.secure, auth: { user: s.user, pass: s.pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
};

const fmt = (a: Address) => (a.name ? `"${a.name.replace(/["\r\n\\]/g, "")}" <${a.address}>` : a.address);

/** Builds the `SmtpSend` an `ImapBackend` uses. `threading` (resolved by ImapBackend from the parent's Message-ID) keeps replies in the same thread. */
export function makeSmtpSend(settings: SmtpSettings, from: string, factory: SmtpTransportFactory = nodemailerFactory): SmtpSend {
  return async (req: SendRequest, threading) => {
    const t = factory(settings);
    try {
      const info = await t.sendMail({
        from, to: req.to.map(fmt), cc: req.cc?.map(fmt), bcc: req.bcc?.map(fmt), subject: req.subject ?? "", text: req.text, html: req.html,
        inReplyTo: threading?.inReplyTo, references: threading?.references,
      });
      return { id: info.messageId };
    } finally {
      t.close();
    }
  };
}
