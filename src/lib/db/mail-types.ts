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
  mode: "push" | "polling";
  /** Provider push subscription (Gmail watch / Graph subscription), renewed by cron. */
  watch?: { id: string | null; expiresAt: Date | null } | null;
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
  updateAccount(id: string, patch: Partial<Omit<MailAccount, "id" | "app" | "envId">>): Promise<void>;
  /** Accounts in polling mode that are due (state not authenticationError), oldest first. */
  dueAccounts(now: Date, limit: number): Promise<MailAccount[]>;
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
  /** Removes environments, accounts, credentials, cursors, links, clients for an org. */
  deleteMailData(orgId: string): Promise<void>;
}
