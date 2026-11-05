export type Provider = 'google' | 'microsoft' | 'imap';
export type Backend = 'gmail_api' | 'graph' | 'imap';
export type AccountState = 'connecting' | 'syncing' | 'connected' | 'throttled' | 'authenticationError' | 'connectError';
export type EventType = 'messageNew' | 'messageMoved' | 'messageDeleted' | 'messageSent' | 'messageFailed' | 'accountConnected' | 'accountInitialized' | 'accountError';

export interface Address { name?: string; address: string }
export interface MessageSummary {
  id: string; threadId?: string; folder: string; date: string;
  from?: Address; to: Address[]; subject: string; flags: string[]; hasAttachments: boolean;
}
export interface Page<T> { items: T[]; nextCursor?: string }
export interface SendRequest {
  to: Address[]; cc?: Address[]; bcc?: Address[]; subject?: string; html?: string; text?: string;
  replyToMessageId?: string; forwardOfMessageId?: string; sendAt?: string; idempotencyKey?: string;
}
export interface ChangeEvent { type: EventType; messageId?: string; folder?: string; at: string }

/** Watch strategy behind one interface: push (Pub/Sub, Graph notifications), poll (cron), idle (VPS worker). */
export interface Watcher { mode: 'push' | 'poll' | 'idle'; start(): Promise<void>; stop(): Promise<void> }

export interface MailBackend {
  readonly backend: Backend;
  connect(): Promise<void>;
  sync(cursor?: string): Promise<{ events: ChangeEvent[]; cursor: string }>;
  listMessages(opts: { folder?: string; q?: string; cursor?: string; limit?: number }): Promise<Page<MessageSummary>>;
  getMessage(id: string, format: 'json' | 'raw'): Promise<unknown>;
  search(q: string): Promise<Page<MessageSummary>>;
  send(req: SendRequest): Promise<{ id: string; threadId?: string }>;
  modify(id: string, patch: { addFlags?: string[]; removeFlags?: string[]; folder?: string }): Promise<void>;
  remove(id: string): Promise<void>;
  watch(): Watcher;
  close(): Promise<void>;
}
