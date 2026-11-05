// GENERATED from /v1/openapi.json by `npm run sdk:generate`. Do not edit by hand.

export const DEFAULT_BASE_URL = "https://inboxwire.buffersoltech.com/v1";

export type Account = {
  id: string;
  externalId: string;
  email: string;
  provider: "google" | "microsoft" | "imap";
  backend: "gmail_api" | "graph" | "imap";
  state: "connecting" | "syncing" | "connected" | "throttled" | "authenticationError" | "connectError";
  lastError: string | null;
  mode: "push" | "polling";
  createdAt: string;
};

export type Deletion = {
  deleted: true;
  deletionRecordId: string;
  revocation: "revoked" | "not_applicable" | "failed";
  rows: {
    [key: string]: number;
  };
};

export type Usage = {
  plan: {
    id: string;
    name: string;
  };
  mailboxes: {
    used: number;
    included: number;
    extra: number;
    mode: "hard_cap" | "metered" | "unlimited";
    extraPriceCents: number;
    estimatedExtraCents: number;
    level: "ok" | "near" | "over";
    canAdd: boolean;
  };
  environments: {
    used: number;
    limit: number;
  };
};

export type ConnectLink = {
  url: string;
  token: string;
  expiresAt: string;
  environment: string;
};

export type Folder = {
  id: string;
  name: string;
  kind: "system" | "user";
  unread?: number;
  total?: number;
};

export type MessagePage = {
  items: MessageSummary[];
  nextCursor?: string;
};

export type MessageSummary = {
  id: string;
  threadId?: string;
  folder: string;
  date: string;
  from?: Address;
  to: Address[];
  subject: string;
  flags: string[];
  hasAttachments: boolean;
};

export type Address = {
  name?: string;
  address: string;
};

export type Attachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  inline?: boolean;
};

export type OutboxItem = {
  id: string;
  accountId: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  sendAt: string;
  messageId?: string;
  threadId?: string;
  error: string | null;
  createdAt: string;
};

export type SendRequest = {
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  subject?: string;
  html?: string;
  text?: string;
  replyToMessageId?: string;
  sendAt?: string;
};

export type WebhookEndpoint = {
  id: string;
  url: string;
  events: ("messageNew" | "messageMoved" | "messageDeleted" | "messageSent" | "messageFailed" | "accountConnected" | "accountInitialized" | "accountError")[];
  enabled: boolean;
  failingSince: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
};

export type Delivery = {
  id: string;
  eventId: string;
  endpointId: string;
  event: string;
  status: "pending" | "succeeded" | "failed" | "retrying";
  attempts: number;
  nextAttemptAt: string | null;
  statusCode: number | null;
  error: string | null;
  latencyMs: number | null;
  responseSnippet: string | null;
  replayOf: string | null;
  replayedAt: string | null;
  createdAt: string;
};

export type ApiError = {
  error: string;
  details?: unknown;
};

export type WebhookEvent = {
  id: string;
  type: "messageNew" | "messageMoved" | "messageDeleted" | "messageSent" | "messageFailed" | "accountConnected" | "accountInitialized" | "accountError";
  created: number;
  data: Record<string, unknown>;
};

export interface OperationInfo {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  pathParams: readonly string[];
  query: readonly string[];
  hasBody: boolean;
  idempotent: boolean;
  binary: boolean;
  scope: "read" | "send" | "admin";
}

export const operations = {
  listAccounts: { method: "get", path: "/accounts", pathParams: [], query: [], hasBody: false, idempotent: false, binary: false, scope: "read" },
  getAccount: { method: "get", path: "/accounts/{id}", pathParams: ["id"], query: [], hasBody: false, idempotent: false, binary: false, scope: "read" },
  deleteAccount: { method: "delete", path: "/accounts/{id}", pathParams: ["id"], query: [], hasBody: false, idempotent: false, binary: false, scope: "admin" },
  getUsage: { method: "get", path: "/usage", pathParams: [], query: [], hasBody: false, idempotent: false, binary: false, scope: "read" },
  createConnectLink: { method: "post", path: "/connect-links", pathParams: [], query: [], hasBody: true, idempotent: false, binary: false, scope: "admin" },
  listFolders: { method: "get", path: "/accounts/{id}/folders", pathParams: ["id"], query: [], hasBody: false, idempotent: false, binary: false, scope: "read" },
  listMessages: { method: "get", path: "/accounts/{id}/messages", pathParams: ["id"], query: ["q","folder","limit","cursor"], hasBody: false, idempotent: false, binary: false, scope: "read" },
  getMessage: { method: "get", path: "/accounts/{id}/messages/{mid}", pathParams: ["id","mid"], query: ["format"], hasBody: false, idempotent: false, binary: false, scope: "read" },
  listAttachments: { method: "get", path: "/accounts/{id}/messages/{mid}/attachments", pathParams: ["id","mid"], query: [], hasBody: false, idempotent: false, binary: false, scope: "read" },
  getAttachment: { method: "get", path: "/accounts/{id}/messages/{mid}/attachments/{aid}", pathParams: ["id","mid","aid"], query: [], hasBody: false, idempotent: false, binary: true, scope: "read" },
  sendMessage: { method: "post", path: "/accounts/{id}/messages/send", pathParams: ["id"], query: [], hasBody: true, idempotent: true, binary: false, scope: "send" },
  getOutboxItem: { method: "get", path: "/outbox/{id}", pathParams: ["id"], query: [], hasBody: false, idempotent: false, binary: false, scope: "read" },
  listWebhooks: { method: "get", path: "/webhooks", pathParams: [], query: [], hasBody: false, idempotent: false, binary: false, scope: "admin" },
  createWebhook: { method: "post", path: "/webhooks", pathParams: [], query: [], hasBody: true, idempotent: false, binary: false, scope: "admin" },
  getWebhook: { method: "get", path: "/webhooks/{id}", pathParams: ["id"], query: [], hasBody: false, idempotent: false, binary: false, scope: "admin" },
  updateWebhook: { method: "patch", path: "/webhooks/{id}", pathParams: ["id"], query: [], hasBody: true, idempotent: false, binary: false, scope: "admin" },
  deleteWebhook: { method: "delete", path: "/webhooks/{id}", pathParams: ["id"], query: [], hasBody: false, idempotent: false, binary: false, scope: "admin" },
  listDeliveries: { method: "get", path: "/deliveries", pathParams: [], query: ["endpointId","status","limit"], hasBody: false, idempotent: false, binary: false, scope: "admin" },
  replayDelivery: { method: "post", path: "/deliveries/{id}/replay", pathParams: ["id"], query: [], hasBody: false, idempotent: false, binary: false, scope: "admin" },
  replayFailedDeliveries: { method: "post", path: "/deliveries/replay", pathParams: [], query: [], hasBody: true, idempotent: false, binary: false, scope: "admin" },
} as const satisfies Record<string, OperationInfo>;

export interface InboxwireClient {
  /** List accounts. Scope: read. */
  listAccounts(): Promise<{
  items: Account[];
}>;
  /** Get an account. Scope: read. */
  getAccount(args: {
    id: string;
  }): Promise<Account>;
  /** Delete an account. Scope: admin. */
  deleteAccount(args: {
    id: string;
  }): Promise<Deletion>;
  /** Get usage. Scope: read. */
  getUsage(): Promise<Usage>;
  /** Create a connect link. Scope: admin. */
  createConnectLink(args: {
    body: {
      externalId?: string;
      redirectUrl?: string;
      email?: string;
    };
  }): Promise<ConnectLink>;
  /** List folders. Scope: read. */
  listFolders(args: {
    id: string;
  }): Promise<{
  items: Folder[];
}>;
  /** List and search messages. Scope: read. */
  listMessages(args: {
    id: string;
    query?: {
      q?: string;
      folder?: string;
      limit?: number;
      cursor?: string;
    };
  }): Promise<MessagePage>;
  /** Get a message. Scope: read. */
  getMessage(args: {
    id: string;
    mid: string;
    query?: {
      format?: "json" | "raw";
    };
  }): Promise<MessageSummary>;
  /** List attachments. Scope: read. */
  listAttachments(args: {
    id: string;
    mid: string;
  }): Promise<{
  items: Attachment[];
}>;
  /** Download an attachment. Scope: read. */
  getAttachment(args: {
    id: string;
    mid: string;
    aid: string;
  }): Promise<ArrayBuffer>;
  /** Send a message. Scope: send. Can cause: messageSent, messageFailed. */
  sendMessage(args: {
    id: string;
    body: SendRequest;
    idempotencyKey?: string;
  }): Promise<OutboxItem>;
  /** Get a queued send. Scope: read. */
  getOutboxItem(args: {
    id: string;
  }): Promise<OutboxItem>;
  /** List webhook endpoints. Scope: admin. */
  listWebhooks(): Promise<{
  items: WebhookEndpoint[];
}>;
  /** Create a webhook endpoint. Scope: admin. */
  createWebhook(args: {
    body: {
      url: string;
      events?: ("messageNew" | "messageMoved" | "messageDeleted" | "messageSent" | "messageFailed" | "accountConnected" | "accountInitialized" | "accountError")[];
    };
  }): Promise<{
  id: string;
  url: string;
  events: ("messageNew" | "messageMoved" | "messageDeleted" | "messageSent" | "messageFailed" | "accountConnected" | "accountInitialized" | "accountError")[];
  enabled: boolean;
  failingSince: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  secret: string;
}>;
  /** Get a webhook endpoint. Scope: admin. */
  getWebhook(args: {
    id: string;
  }): Promise<WebhookEndpoint>;
  /** Update a webhook endpoint. Scope: admin. */
  updateWebhook(args: {
    id: string;
    body: {
      url?: string;
      events?: ("messageNew" | "messageMoved" | "messageDeleted" | "messageSent" | "messageFailed" | "accountConnected" | "accountInitialized" | "accountError")[];
      enabled?: boolean;
    };
  }): Promise<WebhookEndpoint>;
  /** Delete a webhook endpoint. Scope: admin. */
  deleteWebhook(args: {
    id: string;
  }): Promise<{
  deleted: boolean;
}>;
  /** List deliveries. Scope: admin. */
  listDeliveries(args?: {
    query?: {
      endpointId?: string;
      status?: "pending" | "succeeded" | "failed" | "retrying";
      limit?: number;
    };
  }): Promise<{
  items: Delivery[];
}>;
  /** Replay a delivery. Scope: admin. */
  replayDelivery(args: {
    id: string;
  }): Promise<Delivery>;
  /** Replay failed deliveries. Scope: admin. */
  replayFailedDeliveries(args: {
    body: {
      endpointId?: string;
      limit?: number;
    };
  }): Promise<{
  replayed: number;
  succeeded: number;
  skipped: number;
}>;
}
