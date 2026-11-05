import type { AttachmentContent, AttachmentMeta, ChangeEvent, Folder, MailBackend, MessageSummary, Page, SendRequest, Watcher } from "@/lib/mailcore";
import { search } from "@/lib/mailcore";
import { buildRfc822 } from "./mime";

/** The slice of the googleapis Gmail client we use; tests pass a fake. */
export interface GmailLike {
  users: {
    getProfile(p: { userId: "me" }): Promise<{ data: { historyId?: string | null; emailAddress?: string | null } }>;
    history: { list(p: Record<string, unknown>): Promise<{ data: { history?: GmailHistory[]; historyId?: string | null; nextPageToken?: string | null } }> };
    messages: {
      list(p: Record<string, unknown>): Promise<{ data: { messages?: { id?: string | null }[]; nextPageToken?: string | null } }>;
      get(p: Record<string, unknown>): Promise<{ data: GmailMessage }>;
      send(p: Record<string, unknown>): Promise<{ data: { id?: string | null; threadId?: string | null } }>;
      attachments: { get(p: Record<string, unknown>): Promise<{ data: { data?: string | null; size?: number | null } }> };
      modify(p: Record<string, unknown>): Promise<unknown>;
      trash(p: Record<string, unknown>): Promise<unknown>;
    };
    labels: { list(p: { userId: "me" }): Promise<{ data: { labels?: { id?: string | null; name?: string | null; type?: string | null }[] } }> };
    watch(p: Record<string, unknown>): Promise<{ data: { historyId?: string | null; expiration?: string | null } }>;
    stop(p: { userId: "me" }): Promise<unknown>;
  };
}
interface GmailHistory {
  messagesAdded?: { message?: { id?: string | null } }[];
  messagesDeleted?: { message?: { id?: string | null } }[];
  labelsAdded?: { message?: { id?: string | null }; labelIds?: string[] }[];
  labelsRemoved?: { message?: { id?: string | null }; labelIds?: string[] }[];
}
interface GmailMessage {
  id?: string | null; threadId?: string | null; labelIds?: string[] | null; internalDate?: string | null; raw?: string | null;
  payload?: { headers?: { name?: string | null; value?: string | null }[]; parts?: GmailPart[] } | null;
}
interface GmailPart { filename?: string | null; mimeType?: string | null; headers?: { name?: string | null; value?: string | null }[]; body?: { attachmentId?: string | null; size?: number | null } | null; parts?: GmailPart[] }
const flatParts = (parts: GmailPart[] = []): GmailPart[] => parts.flatMap((p) => [p, ...flatParts(p.parts)]);

const parseAddr = (s?: string): { name?: string; address: string }[] =>
  (s ?? "").split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = /^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/.exec(p);
    return m ? { name: m[1]?.trim() || undefined, address: m[2]! } : { address: p };
  });

export function toSummary(m: GmailMessage): MessageSummary {
  const h = (n: string) => m.payload?.headers?.find((x) => x.name?.toLowerCase() === n)?.value ?? undefined;
  const labels = m.labelIds ?? [];
  const flags = [!labels.includes("UNREAD") ? "\\Seen" : "", labels.includes("STARRED") ? "\\Flagged" : "", labels.includes("DRAFT") ? "\\Draft" : ""].filter(Boolean);
  return {
    id: m.id ?? "", threadId: m.threadId ?? undefined, folder: labels.includes("INBOX") ? "INBOX" : labels.find((l) => !["UNREAD", "STARRED", "IMPORTANT"].includes(l)) ?? "ALL",
    date: new Date(Number(m.internalDate ?? Date.now())).toISOString(), from: parseAddr(h("from"))[0], to: parseAddr(h("to")),
    subject: h("subject") ?? "", flags, hasAttachments: flatParts(m.payload?.parts).some((p) => !!p.filename),
  };
}

export class GmailBackend implements MailBackend {
  readonly backend = "gmail_api" as const;
  constructor(private gmail: GmailLike, private opts: { email: string; topic?: string | null; pollMode?: boolean } = { email: "" }) {}

  async connect() { await this.gmail.users.getProfile({ userId: "me" }); }

  /** `cursor` is a Gmail historyId. No cursor = baseline (no events). Expired history (404) re-baselines. */
  async sync(cursor?: string): Promise<{ events: ChangeEvent[]; cursor: string }> {
    if (!cursor) return { events: [], cursor: (await this.gmail.users.getProfile({ userId: "me" })).data.historyId ?? "0" };
    const events: ChangeEvent[] = [];
    let token: string | undefined;
    let latest = cursor;
    const at = new Date().toISOString();
    try {
      do {
        const { data } = await this.gmail.users.history.list({ userId: "me", startHistoryId: cursor, pageToken: token, maxResults: 200 });
        for (const h of data.history ?? []) {
          for (const a of h.messagesAdded ?? []) events.push({ type: "messageNew", messageId: a.message?.id ?? undefined, at });
          for (const d of h.messagesDeleted ?? []) events.push({ type: "messageDeleted", messageId: d.message?.id ?? undefined, at });
          for (const l of [...(h.labelsAdded ?? []), ...(h.labelsRemoved ?? [])]) events.push({ type: "messageMoved", messageId: l.message?.id ?? undefined, at });
        }
        if (data.historyId) latest = data.historyId;
        token = data.nextPageToken ?? undefined;
      } while (token);
    } catch (e) {
      if ((e as { code?: number }).code === 404) return { events: [{ type: "accountInitialized", at }], cursor: (await this.gmail.users.getProfile({ userId: "me" })).data.historyId ?? "0" };
      throw e;
    }
    return { events, cursor: latest };
  }

  async listMessages(o: { folder?: string; q?: string; cursor?: string; limit?: number }): Promise<Page<MessageSummary>> {
    const { data } = await this.gmail.users.messages.list({ userId: "me", q: o.q ? search.toGmail(search.parseQuery(o.q)) : undefined, labelIds: o.folder ? [o.folder] : undefined, pageToken: o.cursor, maxResults: Math.min(o.limit ?? 25, 100) });
    const items = await Promise.all((data.messages ?? []).map(async (m) => toSummary((await this.gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "To", "Subject"] })).data)));
    return { items, nextCursor: data.nextPageToken ?? undefined };
  }
  async folders(): Promise<Folder[]> {
    const { data } = await this.gmail.users.labels.list({ userId: "me" });
    return (data.labels ?? []).filter((l) => l.id).map((l) => ({ id: l.id!, name: l.name ?? l.id!, kind: l.type === "user" ? "user" : "system" }));
  }
  async attachments(messageId: string): Promise<AttachmentMeta[]> {
    const { data } = await this.gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    return flatParts(data.payload?.parts).filter((p) => p.filename && p.body?.attachmentId).map((p) => ({
      id: p.body!.attachmentId!, filename: p.filename!, contentType: p.mimeType ?? "application/octet-stream", size: p.body?.size ?? 0,
      inline: /inline/i.test(p.headers?.find((h) => h.name?.toLowerCase() === "content-disposition")?.value ?? ""),
    }));
  }
  async attachment(messageId: string, attachmentId: string): Promise<AttachmentContent> {
    const meta = (await this.attachments(messageId)).find((a) => a.id === attachmentId);
    if (!meta) throw new Error("not_found");
    const { data } = await this.gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
    return { ...meta, data: Buffer.from(data.data ?? "", "base64url") };
  }
  async getMessage(id: string, format: "json" | "raw") {
    const { data } = await this.gmail.users.messages.get({ userId: "me", id, format: format === "raw" ? "raw" : "full" });
    return format === "raw" ? Buffer.from(data.raw ?? "", "base64url") : { ...toSummary(data), payload: data.payload };
  }
  search(q: string) { return this.listMessages({ q }); }

  async send(req: SendRequest) {
    let inReplyTo: string | undefined; let threadId: string | undefined;
    if (req.replyToMessageId) {
      const { data } = await this.gmail.users.messages.get({ userId: "me", id: req.replyToMessageId, format: "metadata", metadataHeaders: ["Message-ID", "References"] });
      inReplyTo = data.payload?.headers?.find((h) => h.name?.toLowerCase() === "message-id")?.value ?? undefined;
      threadId = data.threadId ?? undefined;
    }
    const raw = Buffer.from(buildRfc822(this.opts.email, req, { inReplyTo })).toString("base64url");
    const { data } = await this.gmail.users.messages.send({ userId: "me", requestBody: { raw, threadId } });
    return { id: data.id ?? "", threadId: data.threadId ?? undefined };
  }
  async modify(id: string, patch: { addFlags?: string[]; removeFlags?: string[]; folder?: string }) {
    const map = (f: string) => (f === "\\Seen" ? "UNREAD" : f === "\\Flagged" ? "STARRED" : f);
    const add = (patch.addFlags ?? []).filter((f) => f !== "\\Seen").map(map);
    const remove = (patch.removeFlags ?? []).filter((f) => f !== "\\Seen").map(map);
    if (patch.addFlags?.includes("\\Seen")) remove.push("UNREAD");
    if (patch.removeFlags?.includes("\\Seen")) add.push("UNREAD");
    if (patch.folder) add.push(patch.folder);
    await this.gmail.users.messages.modify({ userId: "me", id, requestBody: { addLabelIds: add, removeLabelIds: remove } });
  }
  async remove(id: string) { await this.gmail.users.messages.trash({ userId: "me", id }); }

  /** Push when a Pub/Sub topic is configured, else polling mode (cron). */
  watch(): Watcher {
    const topic = this.opts.topic;
    const push = !!topic && !this.opts.pollMode;
    return {
      mode: push ? "push" : "poll",
      start: async () => {
        if (!push) return;
        const { data } = await this.gmail.users.watch({ userId: "me", requestBody: { topicName: topic, labelIds: ["INBOX"] } });
        return { id: null, expiresAt: data.expiration ? new Date(Number(data.expiration)) : null };
      },
      stop: async () => { if (push) await this.gmail.users.stop({ userId: "me" }); },
    };
  }
  async close() {}
}
