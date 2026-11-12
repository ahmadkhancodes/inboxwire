import type { Db, MailAccount } from "@/lib/db/types";
import type { ChangeEvent, MailBackend } from "@/lib/mailcore";
import { openForOrg, orgOfEnv, hookToken } from "@/lib/secrets";
import { appUrl } from "@/lib/env";
import { refreshAccessToken } from "@/lib/connect/oauth";
import { GmailBackend, type GmailLike } from "./gmail";
import { GraphBackend, type GraphLike } from "./graph";
import { ImapBackend, imapflowFactory, type ImapFactory, type ImapSettings } from "./imap";
import { assertPublicHost, type Lookup } from "@/lib/security/net";
import { isSandboxAccount, sandboxBackend } from "./sandbox";
import { makeSmtpSend, nodemailerFactory, type SmtpSettings, type SmtpTransportFactory } from "./smtp";

/** Emits a webhook event for an org; `ctx.envId` scopes it to endpoints of that environment. */
export type Emit = (orgId: string, type: string, data: unknown, ctx?: { envId: string }) => Promise<unknown>;

export interface BackendDeps { fetchFn?: typeof fetch; imapFactory?: ImapFactory; gmail?: (accessToken: string) => GmailLike; graph?: (accessToken: string) => GraphLike; smtp?: SmtpTransportFactory; now?: Date; lookup?: Lookup }

const FRESH_MS = 60_000;
/** Whole-client budget for Graph (one signal per client) and per-request for Gmail; below the 60 s function limit. */
const PROVIDER_TIMEOUT_MS = 30_000;
const SYNC_LEASE_MS = 2 * 60_000;

/** Decrypts credentials (refreshing an expired OAuth access token) and builds the right MailBackend. */
export async function backendFor(db: Db, account: MailAccount, deps: BackendDeps = {}): Promise<MailBackend> {
  if (isSandboxAccount(account.externalId)) return sandboxBackend();
  const orgId = await orgOfEnv(db, account.envId);
  const cred = await db.getCredentials(account.id);
  if (!cred) throw new Error("no_credentials");
  if (account.backend === "imap") {
    if (!cred.imapSmtpEnc) throw new Error("no_credentials");
    const s = JSON.parse(await openForOrg(db, orgId, cred.imapSmtpEnc)) as { imap: ImapSettings; smtp?: SmtpSettings };
    // Checked again on every use, not only at connect time: the server's DNS answer can change later.
    for (const h of [s.imap.host, s.smtp?.host]) if (h) await assertPublicHost(h, { lookup: deps.lookup });
    const smtp = s.smtp ? makeSmtpSend(s.smtp, account.email, deps.smtp ?? nodemailerFactory) : undefined;
    return new ImapBackend(s.imap, deps.imapFactory ?? imapflowFactory, smtp);
  }
  const provider = account.backend === "gmail_api" ? "google" : "microsoft";
  let access = cred.accessTokenEnc ? await openForOrg(db, orgId, cred.accessTokenEnc) : "";
  const now = deps.now ?? new Date();
  if (!access || !cred.expiresAt || cred.expiresAt.getTime() - now.getTime() < FRESH_MS) {
    const client = await db.getOAuthClient(account.envId, provider);
    if (!client || !cred.refreshTokenEnc) throw new Error("no_credentials");
    const t = await refreshAccessToken(provider, { clientId: client.clientId, clientSecret: await openForOrg(db, orgId, client.clientSecretEnc), refreshToken: await openForOrg(db, orgId, cred.refreshTokenEnc) }, deps.fetchFn, now);
    access = t.accessToken;
    const { sealForOrg } = await import("@/lib/secrets");
    await db.setCredentials({ ...cred, accessTokenEnc: await sealForOrg(db, orgId, t.accessToken), refreshTokenEnc: t.refreshToken ? await sealForOrg(db, orgId, t.refreshToken) : cred.refreshTokenEnc, expiresAt: t.expiresAt });
  }
  if (account.backend === "gmail_api") {
    const client = await db.getOAuthClient(account.envId, "google");
    const gmail = deps.gmail ? deps.gmail(access) : await realGmail(access);
    return new GmailBackend(gmail, { email: account.email, topic: client?.pubsubTopic, pollMode: account.mode === "polling" });
  }
  const graph = deps.graph ? deps.graph(access) : await realGraph(access);
  return new GraphBackend(graph, { notificationUrl: account.mode === "push" ? `${appUrl()}/api/hooks/graph/${account.envId}` : undefined, clientState: hookToken(account.envId), subscriptionId: account.watch?.id });
}

async function realGmail(token: string): Promise<GmailLike> {
  // Subpath imports keep tsc and the bundle from loading all ~400 Google API typings.
  const { gmail } = await import("googleapis/build/src/apis/gmail/index.js");
  const { OAuth2Client } = await import("google-auth-library");
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  // Explicit request timeout: a hung provider call must end before the route's 60 s maxDuration and the 2 min outbox lease.
  return gmail({ version: "v1", auth, timeout: PROVIDER_TIMEOUT_MS }) as unknown as GmailLike;
}
async function realGraph(token: string): Promise<GraphLike> {
  const { Client } = await import("@microsoft/microsoft-graph-client");
  return Client.init({ authProvider: (done) => done(null, token), fetchOptions: { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) } }) as unknown as GraphLike;
}

export interface SyncOutcome { accountId: string; events: number; ok: boolean; error?: string }

/** Runs one sync for an account: loads the cursor, syncs, stores the new cursor, emits webhook events, schedules the next poll. */
export async function syncAccount(db: Db, accountId: string, deps: BackendDeps & { emit?: Emit; pollEveryMs?: number; deliverBudgetMs?: number } = {}): Promise<SyncOutcome> {
  const now = deps.now ?? new Date();
  // One sync per account at a time (a push hook and the poll cron can arrive together). A refused caller marks the
  // account dirty, and the holder syncs once more before it lets go, so a change that lands mid-sync is not left waiting.
  if (!(await db.claimSync(accountId, now, SYNC_LEASE_MS))) return { accountId, events: 0, ok: true, error: "sync_in_progress" };
  let held = true;
  try {
    let out = await syncOnce(db, accountId, deps);
    for (let i = 0; i < 2 && out.ok; i++) {
      held = false;
      if (!(await db.releaseSync(accountId))) return out;
      if (!(await db.claimSync(accountId, now, SYNC_LEASE_MS))) return out;
      held = true;
      const again = await syncOnce(db, accountId, deps);
      out = { ...again, events: out.events + again.events };
    }
    return out;
  } finally {
    if (held) await db.releaseSync(accountId).catch(() => false);
  }
}

async function syncOnce(db: Db, accountId: string, deps: BackendDeps & { emit?: Emit; pollEveryMs?: number; deliverBudgetMs?: number }): Promise<SyncOutcome> {
  const account = await db.getAccount(accountId);
  if (!account) return { accountId, events: 0, ok: false, error: "not_found" };
  const now = deps.now ?? new Date();
  const next = new Date(now.getTime() + (deps.pollEveryMs ?? 60_000));
  let backend: MailBackend | null = null;
  try {
    backend = await backendFor(db, account, deps);
    const folder = account.backend === "imap" ? "INBOX" : "*";
    const cur = await db.getCursor(accountId, folder);
    const cursorValue = account.backend === "gmail_api" ? cur?.historyId : account.backend === "graph" ? cur?.deltaLink : cur?.uidvalidity ? JSON.stringify({ uidvalidity: cur.uidvalidity, uidnext: cur.uidnext }) : undefined;
    const r = await backend.sync(cursorValue ?? undefined);
    const orgId = await orgOfEnv(db, account.envId);
    // Every event is durably queued BEFORE the cursor moves: a crash or timeout in between re-reads the same changes
    // (at-least-once) instead of skipping them. Delivery happens after, inside a time budget; the rest is left to the cron.
    const outbound = deps.emit ? null : await import("@/lib/webhooks/outbound");
    const queued: Awaited<ReturnType<NonNullable<typeof outbound>["emitEvent"]>> = [];
    for (const e of r.events) {
      const data = { accountId, ...eventData(e) };
      if (deps.emit) await deps.emit(orgId, e.type, data, { envId: account.envId });
      else queued.push(...(await outbound!.emitEvent(orgId, e.type, data, { db, envId: account.envId, attempt: false, now })));
    }
    await db.setCursor(storeCursor(account, folder, r.cursor));
    await db.updateAccount(accountId, { state: "connected", lastError: null, nextPollAt: account.mode === "polling" ? next : null });
    if (outbound && queued.length) await outbound.deliverQueued(db, queued, { budgetMs: deps.deliverBudgetMs ?? 20_000 }).catch(() => {});
    return { accountId, events: r.events.length, ok: true };
  } catch (e) {
    const msg = (e as Error).message || "sync_failed";
    const auth = /auth|oauth_|invalid_grant|no_credentials|login/i.test(msg);
    await db.updateAccount(accountId, { state: auth ? "authenticationError" : "connectError", lastError: msg.slice(0, 200), nextPollAt: auth ? null : new Date(now.getTime() + 5 * 60_000) });
    return { accountId, events: 0, ok: false, error: msg };
  } finally {
    await backend?.close().catch(() => {});
  }
}

const eventData = (e: ChangeEvent) => ({ messageId: e.messageId, folder: e.folder, at: e.at });

function storeCursor(a: MailAccount, folder: string, value: string) {
  if (a.backend === "gmail_api") return { accountId: a.id, folder, historyId: value };
  if (a.backend === "graph") return { accountId: a.id, folder, deltaLink: value };
  const c = JSON.parse(value) as { uidvalidity: string; uidnext: number };
  return { accountId: a.id, folder, uidvalidity: c.uidvalidity, uidnext: c.uidnext };
}
