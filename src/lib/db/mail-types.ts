// M2 collections (docs/ARCHITECTURE.md section 6). Secrets are envelope-encrypted (`*Enc` = base64 AES-256-GCM blob).
import type { AccountState, Backend, Provider } from "@/lib/mailcore";

export type EnvName = "development" | "staging" | "production";

export interface Environment { id: string; app: string; orgId: string; name: EnvName; createdAt: Date }

export type OAuthProvider = Exclude<Provider, "imap">;

export interface OAuthClient {
  id: string;
  app: string;
  envId: string;
  provider: OAuthProvider;
  clientId: string;
  clientSecretEnc: string;
  /** Google is BYO only (ARCHITECTURE section 3); Microsoft too in this build. */
  mode: "byo";
  pubsubTopic?: string | null;
  /** Service account Pub/Sub signs push tokens with (OIDC `email` claim). */
  pubsubServiceAccount?: string | null;
  watchState?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MailAccount {
  id: string;
  app: string;
  envId: string;
  externalId: string;
  email: string;
  provider: Provider;
  backend: Backend;
  state: AccountState;
  lastError: string | null;
  nextPollAt: Date | null;
  /** Held while a sync runs, so a push hook and the poll cron never sync one account at once. */
  syncLeaseUntil?: Date | null;
  syncDirty?: boolean;
  mode: "push" | "polling";
  /** Provider push subscription (Gmail watch / Graph subscription), renewed by cron. */
  watch?: { id: string | null; expiresAt: Date | null; /** Do not retry a failed renewal before this time. */ retryAt?: Date | null } | null;
  createdAt: Date;
}

export interface AccountCredential {
  accountId: string;
  app: string;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  expiresAt?: Date | null;
  /** JSON {imap:{host,port,secure,user,pass}, smtp:{...}} encrypted. */
  imapSmtpEnc?: string | null;
  updatedAt: Date;
}

export interface SyncCursor {
  accountId: string;
  app: string;
  folder: string;
  uidvalidity?: string | null;
  uidnext?: number | null;
  modseq?: string | null;
  historyId?: string | null;
  deltaLink?: string | null;
  updatedAt: Date;
}

export interface ConnectLink {
  /** sha256 of the token (the token itself is never stored). */
  id: string;
  app: string;
  envId: string;
  externalId: string | null;
  redirectUrl: string | null;
  email?: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  /** In-flight OAuth: sha256 of `state`, PKCE verifier, provider. Single use. */
  oauth?: { stateHash: string; verifier: string; provider: OAuthProvider; email?: string | null } | null;
}

export type OutboxStatus = "queued" | "sending" | "sent" | "failed";

/** A queued send. Unique (accountId, idempotencyKey); kept 7 days (`expireAt` TTL). The request payload is envelope-encrypted and dropped once the item is terminal. */
export interface OutboxItem {
  id: string;
  app: string;
  envId: string;
  accountId: string;
  idempotencyKey: string;
  /** sha256 of the canonical request, so a reused key with a different body is rejected. */
  requestHash: string;
  status: OutboxStatus;
  attempts: number;
  sendAt: Date;
  /** Next time a worker may pick this up (also the lease end while `sending`). */
  nextAttemptAt: Date | null;
  payloadEnc: string | null;
  result: { id: string; threadId?: string } | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  expireAt: Date;
}

export const OUTBOX_RETENTION_MS = 7 * 86_400_000;

/** An issued self-host licence key (Ed25519, offline-verifiable). One per paid invoice (`invoiceId` is unique). */
export interface LicenceRecord {
  id: string;
  app: string;
  orgId: string;
  plan: "selfhost";
  invoiceId: string;
  /** The `IBW1.<payload>.<signature>` key. It is a bearer token for the customer's own instance, shown in Billing. */
  key: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}

/** Evidence that data was deleted (CASA / GDPR). Holds no mailbox content: the address is only kept as a sha256. */
export interface DeletionRecord {
  id: string;
  app: string;
  orgId: string;
  envId: string | null;
  accountId: string | null;
  emailHash: string | null;
  reason: "api" | "post_cancel_purge" | "org_deleted";
  /** Provider-side revocation: `revoked` (Google), `not_applicable` (IMAP password, Microsoft has no per-token revoke), `failed` (our copy was deleted anyway). */
  revocation: "revoked" | "not_applicable" | "failed";
  deleted: Record<string, number>;
  at: Date;
}

export interface OrgKey { orgId: string; app: string; wrappedDek: string; createdAt: Date }

export interface MailStore {
  // environments
  ensureEnvironment(orgId: string, name: EnvName): Promise<Environment>;
  getEnvironment(id: string): Promise<Environment | null>;
  listEnvironments(orgId: string): Promise<Environment[]>;
  // org data keys (wrapped by MASTER_KEY). putOrgKey is insert-if-absent and returns the winner.
  getOrgKey(orgId: string): Promise<OrgKey | null>;
  putOrgKey(orgId: string, wrappedDek: string): Promise<OrgKey>;
  // BYO OAuth clients, unique (envId, provider)
  upsertOAuthClient(c: Omit<OAuthClient, "app" | "createdAt" | "updatedAt">): Promise<OAuthClient>;
  getOAuthClient(envId: string, provider: OAuthProvider): Promise<OAuthClient | null>;
  listOAuthClients(envId: string): Promise<OAuthClient[]>;
  deleteOAuthClient(envId: string, provider: OAuthProvider): Promise<void>;
  // accounts, unique (envId, externalId)
  upsertAccount(a: Omit<MailAccount, "app" | "createdAt">): Promise<MailAccount>;
  getAccount(id: string): Promise<MailAccount | null>;
  findAccountByEmail(envId: string, email: string): Promise<MailAccount | null>;
  findAccountByWatchId(watchId: string): Promise<MailAccount | null>;
  listAccounts(envId: string): Promise<MailAccount[]>;
  /** Per-account sync lease: true if this caller now holds it (lease expires after leaseMs). A refused caller marks the account dirty. */
  claimSync(id: string, now: Date, leaseMs: number): Promise<boolean>;
  /** Releases the lease; true if someone asked for a sync while it was held (the holder should sync once more). */
  releaseSync(id: string): Promise<boolean>;
  updateAccount(id: string, patch: Partial<Omit<MailAccount, "id" | "app" | "envId">>): Promise<void>;
  /** Accounts in polling mode that are due (state not authenticationError), oldest first. */
  dueAccounts(now: Date, limit: number): Promise<MailAccount[]>;
  /** Push accounts whose provider watch/subscription expires at or before `before` (state not authenticationError), soonest first. */
  renewableAccounts(before: Date, limit: number): Promise<MailAccount[]>;
  // credentials + cursors
  setCredentials(c: Omit<AccountCredential, "app" | "updatedAt">): Promise<void>;
  getCredentials(accountId: string): Promise<AccountCredential | null>;
  setCursor(c: Omit<SyncCursor, "app" | "updatedAt">): Promise<void>;
  getCursor(accountId: string, folder: string): Promise<SyncCursor | null>;
  // connect links
  createConnectLink(l: Omit<ConnectLink, "app" | "createdAt" | "usedAt">): Promise<ConnectLink>;
  getConnectLink(id: string): Promise<ConnectLink | null>;
  getConnectLinkByState(stateHash: string): Promise<ConnectLink | null>;
  setConnectLinkOAuth(id: string, oauth: ConnectLink["oauth"]): Promise<void>;
  /** Atomic single use: true only for the first caller while unexpired. */
  consumeConnectLink(id: string, now: Date): Promise<boolean>;
  // outbox (send queue + Idempotency-Key)
  /** Insert-if-absent on (accountId, idempotencyKey). `created` is false when the key already existed (the existing item is returned). */
  insertOutbox(o: Omit<OutboxItem, "app">): Promise<{ item: OutboxItem; created: boolean }>;
  getOutbox(envId: string, id: string): Promise<OutboxItem | null>;
  updateOutbox(id: string, patch: Partial<Omit<OutboxItem, "id" | "app" | "envId" | "accountId">>): Promise<void>;
  /** Atomic claim: queued (or a `sending` item whose lease ended) with nextAttemptAt <= now becomes `sending`, attempts+1, lease until now+leaseMs. Null when someone else got it. */
  claimOutbox(id: string, now: Date, leaseMs: number): Promise<OutboxItem | null>;
  dueOutbox(now: Date, limit: number): Promise<OutboxItem[]>;
  // M4: dashboard, compliance, licences, metrics
  /** Newest first, across the given environments. */
  listOutbox(envIds: string[], limit: number): Promise<OutboxItem[]>;
  /** Removes one account with its credentials, cursors and outbox items. Returns row counts. */
  deleteAccountData(accountId: string): Promise<Record<string, number>>;
  /** Insert-if-absent on invoiceId. */
  insertLicence(l: Omit<LicenceRecord, "app">): Promise<{ licence: LicenceRecord; created: boolean }>;
  listLicences(orgId: string): Promise<LicenceRecord[]>;
  addDeletionRecord(r: Omit<DeletionRecord, "app" | "at"> & { at?: Date }): Promise<DeletionRecord>;
  listDeletionRecords(orgId: string): Promise<DeletionRecord[]>;
  /** Counts for /metrics: accounts by state, outbox by status. */
  mailCounts(): Promise<{ accounts: Record<string, number>; outbox: Record<string, number> }>;
  /** Removes environments, accounts, credentials, cursors, links, clients for an org. */
  deleteMailData(orgId: string): Promise<void>;
}
