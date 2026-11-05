import { z } from "zod";
import { product } from "@/config/product";
import { appUrl } from "@/lib/env";
import type { Scope } from "@/lib/auth/scopes";
import { EVENT_TYPES } from "@/lib/webhooks/outbound";
import {
  AccountSchema, AttachmentSchema, BulkReplayBody, ConnectLinkBody, ConnectLinkSchema, DeliveryListQuery, DeliverySchema, ErrorSchema, FolderSchema,
  MessageListQuery, MessagePageSchema, MessageSummarySchema, OutboxSchema, SendBodySchema, WebhookCreateBody, WebhookEndpointSchema, WebhookPatchBody,
} from "@/lib/v1/schemas";

// OpenAPI 3.1 generated from the same Zod schemas the routes validate with. Add an operation here when you add a route.

export interface Operation {
  id: string; method: "get" | "post" | "patch" | "delete"; path: string; tag: string; summary: string; description: string; scope: Scope;
  pathParams?: string[]; query?: z.ZodType; body?: z.ZodType; response?: z.ZodType; status?: number; binary?: string;
  /** Webhook events this call can cause. */
  causes?: EventName[]; idempotent?: boolean; errors?: number[];
}
type EventName = (typeof EVENT_TYPES)[number];

const list = <T extends z.ZodType>(s: T) => z.object({ items: z.array(s) });
const ID = { pathParams: ["id"] };

export const operations: Operation[] = [
  { id: "listAccounts", method: "get", path: "/accounts", tag: "Accounts", summary: "List accounts", description: "Mailboxes connected in the key's environment.", scope: "read", response: list(AccountSchema) },
  { id: "getAccount", method: "get", path: "/accounts/{id}", tag: "Accounts", summary: "Get an account", description: "State of one mailbox, including the last error and whether it runs on push or polling.", scope: "read", ...ID, response: AccountSchema, errors: [404] },
  { id: "createConnectLink", method: "post", path: "/connect-links", tag: "Accounts", summary: "Create a connect link", description: "Single-use hosted connect page URL, valid for 24 hours. Opening it a second time returns 410. Needs the admin scope.", scope: "admin", body: ConnectLinkBody, response: ConnectLinkSchema, status: 201, errors: [400] },
  { id: "listFolders", method: "get", path: "/accounts/{id}/folders", tag: "Read", summary: "List folders", description: "Folders (IMAP, Microsoft) or labels (Gmail).", scope: "read", ...ID, response: list(FolderSchema), errors: [404, 502] },
  { id: "listMessages", method: "get", path: "/accounts/{id}/messages", tag: "Read", summary: "List and search messages", description: "Newest first with cursor pagination. `q` accepts one syntax on every provider (from:, to:, subject:, after:, before:, has:attachment, bare words) and is translated to Gmail `q`, Graph `$filter`/`$search` or IMAP SEARCH.", scope: "read", ...ID, query: MessageListQuery, response: MessagePageSchema, errors: [400, 404, 502] },
  { id: "getMessage", method: "get", path: "/accounts/{id}/messages/{mid}", tag: "Read", summary: "Get a message", description: "Metadata as JSON, or with `format=raw` the original RFC 822 source (`message/rfc822`). Bodies are fetched from the provider on request and never stored.", scope: "read", pathParams: ["id", "mid"], query: z.object({ format: z.enum(["json", "raw"]).default("json") }), response: MessageSummarySchema, errors: [400, 404, 502] },
  { id: "listAttachments", method: "get", path: "/accounts/{id}/messages/{mid}/attachments", tag: "Read", summary: "List attachments", description: "Attachment metadata of one message.", scope: "read", pathParams: ["id", "mid"], response: list(AttachmentSchema), errors: [404, 502] },
  { id: "getAttachment", method: "get", path: "/accounts/{id}/messages/{mid}/attachments/{aid}", tag: "Read", summary: "Download an attachment", description: "The attachment bytes, always served as a download.", scope: "read", pathParams: ["id", "mid", "aid"], binary: "application/octet-stream", errors: [404, 502] },
  { id: "sendMessage", method: "post", path: "/accounts/{id}/messages/send", tag: "Send", summary: "Send a message", description: "Queues the message and answers 202 with the outbox id. Gmail and Microsoft send through their APIs, IMAP accounts through the mailbox's SMTP server. Send an `Idempotency-Key` header to make retries safe: for 7 days a repeat returns the original item with `Idempotent-Replayed: true`, and the same key with a different body returns 422.", scope: "send", ...ID, body: SendBodySchema, response: OutboxSchema, status: 202, idempotent: true, causes: ["messageSent", "messageFailed"], errors: [400, 404, 422] },
  { id: "getOutboxItem", method: "get", path: "/outbox/{id}", tag: "Send", summary: "Get a queued send", description: "Status of a send: queued, sending, sent or failed.", scope: "read", ...ID, response: OutboxSchema, errors: [404] },
  { id: "listWebhooks", method: "get", path: "/webhooks", tag: "Webhooks", summary: "List webhook endpoints", description: "Endpoints of the key's environment.", scope: "admin", response: list(WebhookEndpointSchema) },
  { id: "createWebhook", method: "post", path: "/webhooks", tag: "Webhooks", summary: "Create a webhook endpoint", description: "New endpoints subscribe to `messageNew` unless `events` is given. The response includes the signing secret once. Deliveries carry `Inboxwire-Signature: t=<unix>,v1=<hex>`, the HMAC-SHA256 of `<t>.<raw body>`.", scope: "admin", body: WebhookCreateBody, response: WebhookEndpointSchema.extend({ secret: z.string() }), status: 201, errors: [400] },
  { id: "getWebhook", method: "get", path: "/webhooks/{id}", tag: "Webhooks", summary: "Get a webhook endpoint", description: "One endpoint, including `failingSince` and why it was disabled.", scope: "admin", ...ID, response: WebhookEndpointSchema, errors: [404] },
  { id: "updateWebhook", method: "patch", path: "/webhooks/{id}", tag: "Webhooks", summary: "Update a webhook endpoint", description: "Change the URL, the event allowlist or `enabled`. Turning a disabled endpoint back on clears its failure clock.", scope: "admin", ...ID, body: WebhookPatchBody, response: WebhookEndpointSchema, errors: [400, 404] },
  { id: "deleteWebhook", method: "delete", path: "/webhooks/{id}", tag: "Webhooks", summary: "Delete a webhook endpoint", description: "Stops all deliveries to the endpoint.", scope: "admin", ...ID, response: z.object({ deleted: z.boolean() }), errors: [404] },
  { id: "listDeliveries", method: "get", path: "/deliveries", tag: "Webhooks", summary: "List deliveries", description: "The delivery log: status, attempts, status code, latency and the start of the response of the last attempt. Failed deliveries retry with backoff for about 24 hours; an endpoint failing for 72 hours is disabled and the owners are emailed.", scope: "admin", query: DeliveryListQuery, response: list(DeliverySchema), errors: [400] },
  { id: "replayDelivery", method: "post", path: "/deliveries/{id}/replay", tag: "Webhooks", summary: "Replay a delivery", description: "Sends the stored payload again as a new delivery with the same event id. 409 when the endpoint is disabled.", scope: "admin", ...ID, response: DeliverySchema, status: 202, errors: [404, 409] },
  { id: "replayFailedDeliveries", method: "post", path: "/deliveries/replay", tag: "Webhooks", summary: "Replay failed deliveries", description: "Bulk replay of failed deliveries that were not replayed yet, optionally for one endpoint.", scope: "admin", body: BulkReplayBody, response: z.object({ replayed: z.number(), succeeded: z.number(), skipped: z.number() }), status: 202 },
];

const ERR_TEXT: Record<number, string> = { 400: "Invalid input", 401: "Missing or invalid API key", 403: "The key's scope does not allow this", 404: "Not found", 409: "Conflict", 422: "Unprocessable", 429: "Rate limited", 502: "The mail provider failed" };

type Json = Record<string, unknown>;
/** Zod -> JSON Schema 2020-12 (OpenAPI 3.1's dialect). `$defs` are hoisted into components. */
function js(schema: z.ZodType, io: "input" | "output", defs: Json): Json {
  const out = z.toJSONSchema(schema, { target: "draft-2020-12", io, unrepresentable: "any" }) as Json;
  const { $defs, $schema: _s, ...rest } = out as Json & { $defs?: Json; $schema?: string };
  Object.assign(defs, $defs ?? {});
  return rest;
}
const fixRefs = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(fixRefs);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "$ref" && typeof x === "string" ? x.replace("#/$defs/", "#/components/schemas/") : fixRefs(x)]));
  return v;
};

export function buildOpenApi(base = appUrl()): Json {
  const defs: Json = {};
  const paths: Record<string, Record<string, Json>> = {};
  for (const op of operations) {
    const parameters: Json[] = (op.pathParams ?? []).map((name) => ({ name, in: "path", required: true, schema: { type: "string" } }));
    if (op.query) {
      const q = js(op.query, "input", defs) as { properties?: Record<string, Json>; required?: string[] };
      for (const [name, schema] of Object.entries(q.properties ?? {})) {
        const { description, ...s } = schema as { description?: string };
        parameters.push({ name, in: "query", required: q.required?.includes(name) ?? false, ...(description ? { description } : {}), schema: s });
      }
    }
    if (op.idempotent) parameters.push({ name: "Idempotency-Key", in: "header", required: false, description: "Up to 255 printable ASCII characters. A repeat within 7 days returns the original result.", schema: { type: "string", maxLength: 255 } });
    const status = String(op.status ?? 200);
    const responses: Record<string, Json> = {
      [status]: op.binary
        ? { description: "The file", content: { [op.binary]: { schema: { type: "string", format: "binary" } } } }
        : { description: "Success", content: { "application/json": { schema: op.response ? js(op.response, "output", defs) : {} } } },
      "401": { description: ERR_TEXT[401], content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      "403": { description: ERR_TEXT[403], content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      "429": { description: ERR_TEXT[429], content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    };
    for (const e of op.errors ?? []) responses[String(e)] = { description: ERR_TEXT[e] ?? "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
    (paths[op.path] ??= {})[op.method] = {
      operationId: op.id, tags: [op.tag], summary: op.summary, description: op.description, parameters,
      ...(op.body ? { requestBody: { required: true, content: { "application/json": { schema: js(op.body, "input", defs) } } } } : {}),
      responses, security: [{ bearerAuth: [op.scope] }],
      "x-required-scope": op.scope, ...(op.causes ? { "x-causes-webhooks": op.causes } : {}),
    };
  }
  const eventSchema = { type: "object", required: ["id", "type", "created", "data"], properties: { id: { type: "string", description: "Event id. Stays the same on retries and replays." }, type: { type: "string", enum: [...EVENT_TYPES] }, created: { type: "integer", description: "Unix seconds" }, data: { type: "object", additionalProperties: true } } };
  const webhooks = Object.fromEntries(EVENT_TYPES.map((e) => [e, { post: { summary: e, description: `Sent to endpoints that list \`${e}\`. Verify \`Inboxwire-Signature\` before trusting it.`, requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookEvent" } } } }, responses: { "2XX": { description: "Return any 2xx within 10 seconds to acknowledge." } } } }]));
  const err = js(ErrorSchema, "output", defs);
  return fixRefs({
    openapi: "3.1.0",
    info: { title: `${product.name} API`, version: "1.0.0", description: `Read, search and send mail across Gmail, Microsoft 365 and IMAP with one API. Authenticate with \`Authorization: Bearer <key>\`. Keys carry scopes: \`read\`, \`send\` (includes read) and \`admin\` (includes both). Pick the environment with the \`x-environment\` header (development, staging, production; default production). Errors are JSON: \`{"error": "code"}\`.` },
    servers: [{ url: `${base}/v1` }],
    tags: ["Accounts", "Read", "Send", "Webhooks"].map((name) => ({ name })),
    paths, webhooks,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "API key from Settings, API keys. `x-api-key` works too." } },
      schemas: { ...defs, Error: err, WebhookEvent: eventSchema },
    },
  }) as Json;
}
