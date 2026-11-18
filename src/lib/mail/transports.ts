import { uuidv7 } from "@/lib/ids";
import { log } from "@/lib/logger";
import type { MailMessage, MailTransport, SendResult } from "./types";

/** Dev/test/stub transport: keeps messages in memory and logs the subject (never the body). */
type Sent = MailMessage & { from: string; id: string; at: Date };
// On globalThis: Next bundles route handlers separately, so a module-level array can be a different copy per route.
const g = globalThis as { __inboxwireOutbox?: Sent[] };
export const outbox: Sent[] = (g.__inboxwireOutbox ??= []);

export function consoleTransport(): MailTransport {
  return {
    name: "console",
    async send(msg) {
      const id = uuidv7();
      outbox.push({ ...msg, id, at: new Date() });
      if (outbox.length > 200) outbox.shift();
      log.info("mail_console", { subject: msg.subject, id });
      // Stub mode only (no mail provider yet): MAIL_CONSOLE_PRINT=1 prints the body so magic links can be used from logs.
      if ((process.env.NODE_ENV === "development" || process.env.MAIL_CONSOLE_PRINT === "1") && process.env.NODE_ENV !== "test")
        console.log(`\n--- mail ${id} ---\n${msg.text}\n---\n`);
      return { id, provider: "console", accepted: true };
    },
  };
}

/** Transactional provider adapter (Resend REST over fetch, no SDK). */
export function resendTransport(apiKey: string, fetchFn: typeof fetch = fetch): MailTransport {
  return {
    name: "resend",
    async send(msg): Promise<SendResult> {
      const res = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html,
          reply_to: msg.replyTo, headers: msg.headers,
          tags: msg.tags ? Object.entries(msg.tags).map(([name, value]) => ({ name, value })) : undefined,
        }),
      });
      if (!res.ok) throw new Error(`mail_send_failed_${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { id: body.id ?? uuidv7(), provider: "resend", accepted: true };
    },
  };
}

/**
 * BufferSol mail gateway (POST {url}/v1/send, Bearer key). The gateway forces this app's own From, so none is sent.
 * `record: "metadata"` keeps OTP / magic-link bodies out of the gateway log. One idempotency key spans the retry.
 */
export function gatewayTransport(url: string, key: string, fetchFn: typeof fetch = fetch): MailTransport {
  return {
    name: "gateway",
    async send(msg): Promise<SendResult> {
      const idempotencyKey = `iw-${uuidv7()}`;
      const body = JSON.stringify({
        to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo,
        record: "metadata", category: "transactional",
      });
      let status = 0;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await fetchFn(`${url.replace(/\/+$/, "")}/v1/send`, {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
          body,
        });
        if (res.ok) {
          const j = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
          return { id: j.messageId ?? j.id ?? uuidv7(), provider: "gateway", accepted: true };
        }
        status = res.status;
        if (status !== 502 && status !== 503) break;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(`mail_send_failed_${status}`);
    },
  };
}

/**
 * SMTP adapter stub for the VPS (own Postfix/KumoMTA). Implement with nodemailer when the VPS exists;
 * the interface stays the same so no caller changes.
 */
export function smtpTransport(): MailTransport {
  return {
    name: "smtp",
    async send() {
      throw new Error("smtp_transport_not_configured");
    },
  };
}
