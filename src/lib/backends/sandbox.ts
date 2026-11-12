import type { MailBackend, MessageSummary } from "@/lib/mailcore";

/**
 * Local stand-in for a provider mailbox, used ONLY when E2E_OUTBOX=1 (never set on Vercel) for accounts whose externalId
 * starts with `e2e-sandbox:`. Lets the docs-run e2e execute every quickstart sample (list, search, send) end to end
 * against the real routes, auth, cursor and outbox code without Google, Microsoft or an IMAP server.
 */
export const SANDBOX_PREFIX = "e2e-sandbox:";

export function isSandboxAccount(externalId: string | null | undefined): boolean {
  return process.env.E2E_OUTBOX === "1" && !!externalId?.startsWith(SANDBOX_PREFIX);
}

const MESSAGES: MessageSummary[] = [
  { id: "sbx_3", folder: "INBOX", date: "2026-11-10T09:00:00.000Z", from: { address: "billing@example.com" }, to: [{ address: "me@example.com" }], subject: "Invoice 1042", flags: [], hasAttachments: true },
  { id: "sbx_2", folder: "INBOX", date: "2026-11-05T09:00:00.000Z", from: { address: "ana@example.com" }, to: [{ address: "me@example.com" }], subject: "Lunch on Friday?", flags: ["\\Seen"], hasAttachments: false },
  { id: "sbx_1", folder: "INBOX", date: "2026-10-20T09:00:00.000Z", from: { address: "billing@example.com" }, to: [{ address: "me@example.com" }], subject: "Invoice 1001", flags: ["\\Seen"], hasAttachments: false },
];

const ATTACHMENT = { id: "att_1", filename: "invoice-1042.pdf", contentType: "application/pdf", size: 5 };

function matches(m: MessageSummary, q?: string): boolean {
  if (!q) return true;
  return q.split(/\s+/).filter(Boolean).every((t) => {
    const [k, ...rest] = t.split(":");
    const v = rest.join(":").toLowerCase();
    if (!rest.length) return m.subject.toLowerCase().includes(t.toLowerCase());
    if (k === "from") return (m.from?.address ?? "").toLowerCase().includes(v);
    if (k === "to") return m.to.some((a) => a.address.toLowerCase().includes(v));
    if (k === "subject") return m.subject.toLowerCase().includes(v);
    if (k === "after") return m.date >= new Date(v).toISOString();
    if (k === "before") return m.date < new Date(v).toISOString();
    if (k === "has") return v !== "attachment" || m.hasAttachments;
    return true;
  });
}

export function sandboxBackend(): MailBackend {
  const list = (q?: string, limit = 50) => ({ items: MESSAGES.filter((m) => matches(m, q)).slice(0, limit) });
  const find = (id: string) => {
    const m = MESSAGES.find((x) => x.id === id);
    if (!m) throw new Error("not_found");
    return m;
  };
  return {
    backend: "imap",
    async connect() {},
    async sync(cursor) { return { events: [], cursor: cursor ?? "sbx" }; },
    async listMessages({ q, limit }) { return list(q, limit); },
    async folders() { return [{ id: "INBOX", name: "Inbox", kind: "system", total: MESSAGES.length }]; },
    async getMessage(id) { return { ...find(id), text: "Sandbox message body." }; },
    async attachments(id) { return find(id).hasAttachments ? [ATTACHMENT] : []; },
    async attachment(id, aid) {
      if (!find(id).hasAttachments || aid !== ATTACHMENT.id) throw new Error("not_found");
      return { ...ATTACHMENT, data: new TextEncoder().encode("%PDF-") };
    },
    async search(q) { return list(q); },
    async send() { return { id: `sbx_sent_${Date.now()}` }; },
    async modify(id) { find(id); },
    async remove(id) { find(id); },
    watch() { return { mode: "poll", async start() {}, async stop() {} }; },
    async close() {},
  };
}
