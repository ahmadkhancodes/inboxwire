import type { ChangeEvent, MailBackend, MessageSummary, Page, SendRequest, Watcher } from "@/lib/mailcore";
import { search } from "@/lib/mailcore";

export interface ImapSettings { host: string; port: number; secure: boolean; user: string; pass: string }

/** Slice of ImapFlow we use. Tests inject a fake through `ImapBackend`'s factory. */
export interface ImapClientLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  close?(): void;
  mailboxOpen(path: string, o?: { readOnly?: boolean }): Promise<{ uidValidity: bigint | number; uidNext: number; highestModseq?: bigint | number }>;
  fetch(range: string, q: Record<string, unknown>, o?: { uid?: boolean }): AsyncIterable<FetchedMessage>;
  fetchOne(seq: string, q: Record<string, unknown>, o?: { uid?: boolean }): Promise<FetchedMessage | false>;
  search(q: Record<string, unknown>, o?: { uid?: boolean }): Promise<number[] | false>;
  messageFlagsAdd(range: string, flags: string[], o?: { uid?: boolean }): Promise<unknown>;
  messageFlagsRemove(range: string, flags: string[], o?: { uid?: boolean }): Promise<unknown>;
  messageMove(range: string, dest: string, o?: { uid?: boolean }): Promise<unknown>;
  messageDelete(range: string, o?: { uid?: boolean }): Promise<unknown>;
  idle?(): Promise<unknown>;
}
export interface FetchedMessage {
  uid: number; flags?: Set<string>; envelope?: { date?: Date; subject?: string; from?: { name?: string; address?: string }[]; to?: { name?: string; address?: string }[] };
  source?: Buffer; bodyStructure?: { childNodes?: { disposition?: string }[] };
}

export type ImapFactory = (s: ImapSettings) => ImapClientLike;
export type SmtpSend = (req: SendRequest, creds: { user: string; pass: string }) => Promise<{ id: string }>;

/** Real factory (lazy import keeps imapflow out of non-IMAP bundles). */
export const imapflowFactory: ImapFactory = (s) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImapFlow } = require("imapflow") as typeof import("imapflow");
  return new ImapFlow({ host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass: s.pass }, logger: false, socketTimeout: 20_000, greetingTimeout: 10_000 }) as unknown as ImapClientLike;
};

const FOLDER = "INBOX";
export type ImapCursor = { uidvalidity: string; uidnext: number };
export const encodeCursor = (c: ImapCursor) => JSON.stringify(c);
const parseCursor = (s?: string): ImapCursor | null => { try { return s ? (JSON.parse(s) as ImapCursor) : null; } catch { return null; } };

function toSummary(m: FetchedMessage, folder: string): MessageSummary {
  const a = (x?: { name?: string; address?: string }) => (x?.address ? { name: x.name || undefined, address: x.address } : undefined);
  return {
    id: String(m.uid), folder, date: (m.envelope?.date ?? new Date(0)).toISOString(), from: a(m.envelope?.from?.[0]),
    to: (m.envelope?.to ?? []).map(a).filter((x): x is NonNullable<typeof x> => !!x), subject: m.envelope?.subject ?? "",
    flags: [...(m.flags ?? [])], hasAttachments: !!m.bodyStructure?.childNodes?.some((n) => n.disposition === "attachment"),
  };
}

export class ImapBackend implements MailBackend {
  readonly backend = "imap" as const;
  private client: ImapClientLike | null = null;
  constructor(private settings: ImapSettings, private factory: ImapFactory = imapflowFactory, private smtp?: SmtpSend) {}

  private async c() {
    if (!this.client) { this.client = this.factory(this.settings); await this.client.connect(); }
    return this.client;
  }
  /** Verifies host + credentials. Throws on failure (the hosted page maps this to 422). */
  async connect() { await this.c(); }

  /** Poll sync: new UIDs since `uidnext`. UIDVALIDITY change resets the baseline (no events, caller may resync). */
  async sync(cursor?: string): Promise<{ events: ChangeEvent[]; cursor: string }> {
    const c = await this.c();
    const box = await c.mailboxOpen(FOLDER, { readOnly: true });
    const now: ImapCursor = { uidvalidity: String(box.uidValidity), uidnext: box.uidNext };
    const prev = parseCursor(cursor);
    if (!prev || prev.uidvalidity !== now.uidvalidity) return { events: [], cursor: encodeCursor(now) };
    const events: ChangeEvent[] = [];
    if (box.uidNext > prev.uidnext) {
      const at = new Date().toISOString();
      for await (const m of c.fetch(`${prev.uidnext}:*`, { uid: true }, { uid: true })) {
        if (m.uid >= prev.uidnext) events.push({ type: "messageNew", messageId: String(m.uid), folder: FOLDER, at });
      }
    }
    return { events, cursor: encodeCursor(now) };
  }

  async listMessages(o: { folder?: string; q?: string; cursor?: string; limit?: number }): Promise<Page<MessageSummary>> {
    const c = await this.c();
    const folder = o.folder ?? FOLDER;
    await c.mailboxOpen(folder, { readOnly: true });
    const limit = Math.min(o.limit ?? 25, 100);
    const found = (await c.search(o.q ? (search.toImap(search.parseQuery(o.q)) as Record<string, unknown>) : { all: true }, { uid: true })) || [];
    const uids = found.sort((a, b) => b - a).filter((u) => !o.cursor || u < Number(o.cursor));
    const page = uids.slice(0, limit);
    const items: MessageSummary[] = [];
    if (page.length) for await (const m of c.fetch(page.join(","), { uid: true, flags: true, envelope: true, bodyStructure: true }, { uid: true })) items.push(toSummary(m, folder));
    items.sort((a, b) => Number(b.id) - Number(a.id));
    return { items, nextCursor: uids.length > limit ? String(page[page.length - 1]) : undefined };
  }
  async getMessage(id: string, format: "json" | "raw") {
    const c = await this.c();
    await c.mailboxOpen(FOLDER, { readOnly: true });
    const m = await c.fetchOne(id, { uid: true, flags: true, envelope: true, bodyStructure: true, source: format === "raw" }, { uid: true });
    if (!m) throw new Error("not_found");
    return format === "raw" ? m.source : toSummary(m, FOLDER);
  }
  search(q: string) { return this.listMessages({ q }); }

  async send(req: SendRequest) {
    if (!this.smtp) throw new Error("smtp_not_configured");
    return this.smtp(req, { user: this.settings.user, pass: this.settings.pass });
  }
  async modify(id: string, patch: { addFlags?: string[]; removeFlags?: string[]; folder?: string }) {
    const c = await this.c();
    await c.mailboxOpen(FOLDER);
    if (patch.addFlags?.length) await c.messageFlagsAdd(id, patch.addFlags, { uid: true });
    if (patch.removeFlags?.length) await c.messageFlagsRemove(id, patch.removeFlags, { uid: true });
    if (patch.folder) await c.messageMove(id, patch.folder, { uid: true });
  }
  async remove(id: string) { const c = await this.c(); await c.mailboxOpen(FOLDER); await c.messageDelete(id, { uid: true }); }

  /** Poll watcher now (cron `poll-imap`); an IdleWatcher replaces it on always-on workers (ARCHITECTURE section 4). */
  watch(): Watcher { return { mode: "poll", start: async () => {}, stop: async () => {} }; }
  async close() { const c = this.client; this.client = null; if (c) await c.logout().catch(() => c.close?.()); }
}
