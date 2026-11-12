import { z } from "zod";
import { EVENT_TYPES } from "@/lib/webhooks/outbound";

// One set of Zod schemas drives request validation, the route handlers' types and the OpenAPI document (src/lib/openapi.ts).

export const AddressSchema = z.object({ name: z.string().max(200).optional(), address: z.string().email().max(320) }).meta({ id: "Address" });

export const AccountSchema = z.object({
  id: z.string(), externalId: z.string(), email: z.string(), provider: z.enum(["google", "microsoft", "imap"]), backend: z.enum(["gmail_api", "graph", "imap"]),
  state: z.enum(["connecting", "syncing", "connected", "throttled", "authenticationError", "connectError"]), lastError: z.string().nullable(),
  mode: z.enum(["push", "polling"]), createdAt: z.string().datetime(),
}).meta({ id: "Account" });

export const FolderSchema = z.object({ id: z.string(), name: z.string(), kind: z.enum(["system", "user"]), unread: z.number().optional(), total: z.number().optional() }).meta({ id: "Folder" });

export const MessageSummarySchema = z.object({
  id: z.string(), threadId: z.string().optional(), folder: z.string(), date: z.string().datetime(), from: AddressSchema.optional(), to: z.array(AddressSchema),
  subject: z.string(), flags: z.array(z.string()), hasAttachments: z.boolean(),
}).meta({ id: "MessageSummary" });

export const AttachmentSchema = z.object({ id: z.string(), filename: z.string(), contentType: z.string(), size: z.number(), inline: z.boolean().optional() }).meta({ id: "Attachment" });

export const MessageListQuery = z.object({
  q: z.string().max(500).optional().describe("Unified search: from: to: subject: after:YYYY-MM-DD before:YYYY-MM-DD has:attachment, bare words, \"quoted phrases\"."),
  folder: z.string().max(300).optional().describe("Folder id from GET /folders."),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(4096).optional().describe("`nextCursor` from the previous page."),
});

export const MessagePageSchema = z.object({ items: z.array(MessageSummarySchema), nextCursor: z.string().optional() }).meta({ id: "MessagePage" });

export const SendBodySchema = z.object({
  to: z.array(AddressSchema).min(1).max(50),
  cc: z.array(AddressSchema).max(50).optional(),
  bcc: z.array(AddressSchema).max(50).optional(),
  subject: z.string().max(998).optional(),
  html: z.string().max(2_000_000).optional(),
  text: z.string().max(2_000_000).optional(),
  replyToMessageId: z.string().max(500).optional().describe("Provider message id to reply to. Gmail keeps the thread through In-Reply-To, References and threadId."),
  sendAt: z.string().datetime().optional().describe("Hold the message until this time (at most 30 days ahead)."),
}).refine((b) => b.html || b.text, { message: "html or text is required", path: ["text"] })
  .refine((b) => b.to.length + (b.cc?.length ?? 0) + (b.bcc?.length ?? 0) <= 100, { message: "at most 100 recipients", path: ["to"] })
  .meta({ id: "SendRequest" });

export const OutboxSchema = z.object({
  id: z.string(), accountId: z.string(), status: z.enum(["queued", "sending", "sent", "failed"]), attempts: z.number(), sendAt: z.string().datetime(),
  messageId: z.string().optional(), threadId: z.string().optional(), error: z.string().nullable(), createdAt: z.string().datetime(),
}).meta({ id: "OutboxItem" });

const EventEnum = z.enum(EVENT_TYPES);
export const WebhookEndpointSchema = z.object({
  id: z.string(), url: z.string().url(), events: z.array(EventEnum), enabled: z.boolean(), failingSince: z.string().datetime().nullable(),
  disabledAt: z.string().datetime().nullable(), disabledReason: z.string().nullable(), createdAt: z.string().datetime(),
}).meta({ id: "WebhookEndpoint" });
export const WebhookCreateBody = z.object({
  url: z.string().url().max(2048),
  events: z.array(EventEnum).min(1).max(EVENT_TYPES.length).default(["messageNew"]).describe("Event allowlist. Defaults to messageNew."),
});
export const WebhookPatchBody = z.object({ url: z.string().url().max(2048).optional(), events: z.array(EventEnum).min(1).max(EVENT_TYPES.length).optional(), enabled: z.boolean().optional() });

export const DeliverySchema = z.object({
  id: z.string(), eventId: z.string(), endpointId: z.string(), event: z.string(), status: z.enum(["pending", "succeeded", "failed", "retrying"]), attempts: z.number(),
  nextAttemptAt: z.string().datetime().nullable(), statusCode: z.number().nullable(), error: z.string().nullable(), latencyMs: z.number().nullable(), responseSnippet: z.string().nullable(),
  replayOf: z.string().nullable(), replayedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(),
}).meta({ id: "Delivery" });
export const DeliveryListQuery = z.object({
  endpointId: z.string().optional(), status: z.enum(["pending", "succeeded", "failed", "retrying"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const BulkReplayBody = z.object({ endpointId: z.string().optional(), limit: z.number().int().min(1).max(100).default(100) });

export const ErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() }).meta({ id: "Error" });

export const ConnectLinkBody = z.object({
  externalId: z.string().min(1).max(200).optional(), redirectUrl: z.string().url().max(2048).optional(), email: z.string().email().max(320).optional(),
});
export const ConnectLinkSchema = z.object({ url: z.string().url(), token: z.string(), expiresAt: z.string().datetime(), environment: z.string() }).meta({ id: "ConnectLink" });

export const UsageSchema = z.object({
  plan: z.object({ id: z.string(), name: z.string() }),
  mailboxes: z.object({
    used: z.number().int(), included: z.number().int().describe("Mailboxes in the plan allowance"), extra: z.number().int().describe("Mailboxes above the allowance, billed per extra mailbox"),
    mode: z.enum(["hard_cap", "metered", "unlimited"]).describe("hard_cap: connecting past the limit returns 402; metered: extras are billed; unlimited: no limit"),
    extraPriceCents: z.number().int(), estimatedExtraCents: z.number().int(), level: z.enum(["ok", "near", "at", "over"]), canAdd: z.boolean(),
  }),
  environments: z.object({ used: z.number().int(), limit: z.number().int() }),
}).meta({ id: "Usage" });

export const DeletionSchema = z.object({
  deleted: z.literal(true), deletionRecordId: z.string(),
  revocation: z.enum(["revoked", "not_applicable", "failed"]).describe("Provider-side token revocation. Our copy of the credentials is deleted in every case."),
  rows: z.record(z.string(), z.number()),
}).meta({ id: "Deletion" });

// ----- view mappers (DB row -> public JSON; never includes secrets or payloads) -----
import type { MailAccount, OutboxItem, WebhookDelivery, WebhookEndpoint } from "@/lib/db/types";
const iso = (d?: Date | null) => (d ? d.toISOString() : null);

export const accountView = (a: MailAccount): z.infer<typeof AccountSchema> => ({
  id: a.id, externalId: a.externalId, email: a.email, provider: a.provider, backend: a.backend, state: a.state, lastError: a.lastError, mode: a.mode, createdAt: a.createdAt.toISOString(),
});
export const outboxView = (o: OutboxItem): z.infer<typeof OutboxSchema> => ({
  id: o.id, accountId: o.accountId, status: o.status, attempts: o.attempts, sendAt: o.sendAt.toISOString(), messageId: o.result?.id, threadId: o.result?.threadId, error: o.error, createdAt: o.createdAt.toISOString(),
});
export const endpointView = (e: WebhookEndpoint) => ({
  id: e.id, url: e.url, events: e.events, enabled: e.enabled, failingSince: iso(e.failingSince), disabledAt: iso(e.disabledAt), disabledReason: e.disabledReason ?? null, createdAt: e.createdAt.toISOString(),
});
export const deliveryView = (d: WebhookDelivery) => ({
  id: d.id, eventId: d.eventId ?? d.id, endpointId: d.endpointId, event: d.event, status: d.status, attempts: d.attempts, nextAttemptAt: iso(d.nextAttemptAt),
  statusCode: d.lastStatusCode, error: d.lastError, latencyMs: d.lastLatencyMs ?? null, responseSnippet: d.lastResponseSnippet ?? null,
  replayOf: d.replayOf ?? null, replayedAt: iso(d.replayedAt), createdAt: d.createdAt.toISOString(),
});
