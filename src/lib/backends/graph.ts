import type { AttachmentContent, AttachmentMeta, ChangeEvent, Folder, MailBackend, MessageSummary, Page, SendRequest, Watcher } from "@/lib/mailcore";
import { search } from "@/lib/mailcore";

/** The slice of @microsoft/microsoft-graph-client we use (`client.api(path).get()` etc.). */
/* eslint-disable @typescript-eslint/no-explicit-any -- Graph responses are loosely typed JSON */
export interface GraphLike {
  api(path: string): {
    get(): Promise<any>; post(body: unknown): Promise<any>; patch(body: unknown): Promise<any>; delete(): Promise<any>;
    header(k: string, v: string): ReturnType<GraphLike["api"]>;
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
interface GraphMessage {
  id: string; conversationId?: string; receivedDateTime?: string; subject?: string; isRead?: boolean; hasAttachments?: boolean;
  parentFolderId?: string; flag?: { flagStatus?: string };
  from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  "@removed"?: unknown;
}
const addr = (a?: { name?: string; address?: string }) => (a?.address ? { name: a.name || undefined, address: a.address } : undefined);

export function toSummary(m: GraphMessage): MessageSummary {
  return {
    id: m.id, threadId: m.conversationId, folder: m.parentFolderId ?? "inbox", date: m.receivedDateTime ?? new Date(0).toISOString(),
    from: addr(m.from?.emailAddress), to: (m.toRecipients ?? []).map((r) => addr(r.emailAddress)).filter((x): x is NonNullable<typeof x> => !!x),
    subject: m.subject ?? "", flags: [m.isRead ? "\\Seen" : "", m.flag?.flagStatus === "flagged" ? "\\Flagged" : ""].filter(Boolean), hasAttachments: !!m.hasAttachments,
  };
}

const SELECT = "$select=id,conversationId,receivedDateTime,subject,isRead,hasAttachments,parentFolderId,flag,from,toRecipients";
const rcpt = (a: { name?: string; address: string }) => ({ emailAddress: { address: a.address, name: a.name } });

export class GraphBackend implements MailBackend {
  readonly backend = "graph" as const;
  constructor(private client: GraphLike, private opts: { notificationUrl?: string; clientState?: string; subscriptionId?: string | null } = {}) {}

  async connect() { await this.client.api("/me?$select=id").get(); }

  /** `cursor` is a delta link. No cursor = baseline: walk the delta to its end and return the final link, no events. */
  async sync(cursor?: string): Promise<{ events: ChangeEvent[]; cursor: string }> {
    const events: ChangeEvent[] = [];
    const at = new Date().toISOString();
    let url: string | undefined = cursor ?? `/me/mailFolders/inbox/messages/delta?$select=id`;
    let delta = cursor ?? "";
    while (url) {
      const page: { value?: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string } = await this.client.api(url).get();
      if (cursor) for (const m of page.value ?? []) events.push({ type: m["@removed"] ? "messageDeleted" : "messageNew", messageId: m.id, at });
      if (page["@odata.deltaLink"]) delta = page["@odata.deltaLink"];
      url = page["@odata.nextLink"];
    }
    return { events, cursor: delta };
  }

  async listMessages(o: { folder?: string; q?: string; cursor?: string; limit?: number }): Promise<Page<MessageSummary>> {
    if (o.cursor && !o.cursor.startsWith("https://graph.microsoft.com/")) throw new Error("invalid_cursor");
    const base = o.cursor ?? `/me/${o.folder ? `mailFolders/${encodeURIComponent(o.folder)}/` : ""}messages?${SELECT}&$top=${Math.min(o.limit ?? 25, 100)}${o.q ? `&${graphQuery(o.q)}` : "&$orderby=receivedDateTime desc"}`;
    const page = await this.client.api(base).get();
    return { items: (page.value ?? []).map(toSummary), nextCursor: page["@odata.nextLink"] };
  }
  async folders(): Promise<Folder[]> {
    const SYSTEM = new Set(["inbox", "drafts", "sent items", "deleted items", "junk email", "archive", "outbox"]);
    const page = await this.client.api("/me/mailFolders?$top=100&$select=id,displayName,unreadItemCount,totalItemCount").get();
    return (page.value ?? []).map((f: { id: string; displayName?: string; unreadItemCount?: number; totalItemCount?: number }) => ({
      id: f.id, name: f.displayName ?? f.id, kind: SYSTEM.has((f.displayName ?? "").toLowerCase()) ? "system" : "user", unread: f.unreadItemCount, total: f.totalItemCount,
    }));
  }
  async attachments(messageId: string): Promise<AttachmentMeta[]> {
    const page = await this.client.api(`/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`).get();
    return (page.value ?? []).map((a: { id: string; name?: string; contentType?: string; size?: number; isInline?: boolean }) => ({
      id: a.id, filename: a.name ?? "attachment", contentType: a.contentType ?? "application/octet-stream", size: a.size ?? 0, inline: !!a.isInline,
    }));
  }
  async attachment(messageId: string, attachmentId: string): Promise<AttachmentContent> {
    const a = await this.client.api(`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`).get();
    if (!a?.contentBytes) throw new Error("not_found");
    return { id: a.id, filename: a.name ?? "attachment", contentType: a.contentType ?? "application/octet-stream", size: a.size ?? 0, inline: !!a.isInline, data: Buffer.from(a.contentBytes, "base64") };
  }
  async getMessage(id: string, format: "json" | "raw") {
    if (format === "raw") return this.client.api(`/me/messages/${id}/$value`).get();
    return toSummary(await this.client.api(`/me/messages/${id}?${SELECT}`).get());
  }
  search(q: string) { return this.listMessages({ q }); }

  async send(req: SendRequest) {
    const message = {
      subject: req.subject ?? "", body: { contentType: req.html ? "HTML" : "Text", content: req.html ?? req.text ?? "" },
      toRecipients: req.to.map(rcpt), ccRecipients: (req.cc ?? []).map(rcpt), bccRecipients: (req.bcc ?? []).map(rcpt),
    };
    if (req.replyToMessageId) {
      const d = await this.client.api(`/me/messages/${req.replyToMessageId}/createReply`).post({ message });
      await this.client.api(`/me/messages/${d.id}/send`).post({});
      return { id: d.id as string, threadId: d.conversationId as string | undefined };
    }
    const draft = await this.client.api("/me/messages").post(message);
    await this.client.api(`/me/messages/${draft.id}/send`).post({});
    return { id: draft.id as string, threadId: draft.conversationId as string | undefined };
  }
  async modify(id: string, patch: { addFlags?: string[]; removeFlags?: string[]; folder?: string }) {
    const body: Record<string, unknown> = {};
    if (patch.addFlags?.includes("\\Seen")) body.isRead = true;
    if (patch.removeFlags?.includes("\\Seen")) body.isRead = false;
    if (patch.addFlags?.includes("\\Flagged")) body.flag = { flagStatus: "flagged" };
    if (patch.removeFlags?.includes("\\Flagged")) body.flag = { flagStatus: "notFlagged" };
    if (Object.keys(body).length) await this.client.api(`/me/messages/${id}`).patch(body);
    if (patch.folder) await this.client.api(`/me/messages/${id}/move`).post({ destinationId: patch.folder });
  }
  async remove(id: string) { await this.client.api(`/me/messages/${id}`).delete(); }

  /** Change notifications to /api/hooks/graph/<envId>; subscriptions last < 3 days. With a stored subscription id `start` renews it in place (a gone subscription is recreated). */
  watch(): Watcher {
    const url = this.opts.notificationUrl;
    let subId: string | null = this.opts.subscriptionId ?? null;
    const expiration = () => new Date(Date.now() + 4200 * 60_000);
    return {
      mode: url ? "push" : "poll",
      start: async () => {
        if (!url) return;
        if (subId) {
          try {
            const exp = expiration();
            const s = await this.client.api(`/subscriptions/${subId}`).patch({ expirationDateTime: exp.toISOString() });
            return { id: subId, expiresAt: new Date(s?.expirationDateTime ?? exp) };
          } catch (e) {
            if ((e as { statusCode?: number }).statusCode !== 404) throw e;
          }
        }
        const exp = expiration();
        const s = await this.client.api("/subscriptions").post({
          changeType: "created,updated,deleted", notificationUrl: url, lifecycleNotificationUrl: url, resource: "/me/mailFolders('inbox')/messages",
          expirationDateTime: exp.toISOString(), clientState: this.opts.clientState,
        });
        subId = s.id;
        return { id: s.id as string, expiresAt: new Date(s.expirationDateTime ?? exp) };
      },
      stop: async () => { if (subId) await this.client.api(`/subscriptions/${subId}`).delete(); },
    };
  }
  async close() {}
}

function graphQuery(q: string): string {
  const g = search.toGraph(search.parseQuery(q));
  return Object.entries(g).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
