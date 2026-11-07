import { backendFor, type BackendDeps, type Emit } from "@/lib/backends";
import { ImapBackend, imapflowFactory, type ImapFactory, type ImapSettings } from "@/lib/backends/imap";
import type { ConnectLink, Db, MailAccount, OAuthProvider } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { assertCanAddMailbox, syncExtraMailboxes } from "@/lib/billing/mailboxes";
import { getStripe } from "@/lib/billing/stripe";
import { log } from "@/lib/logger";
import { assertPublicHost } from "@/lib/security/net";
import { orgOfEnv, sealForOrg } from "@/lib/secrets";
import type { TokenSet } from "./oauth";

export interface CompleteDeps extends BackendDeps {
  emit?: Emit;
  imapFactory?: ImapFactory;
  /** Tests: skip the Stripe quantity sync. */
  noBilling?: boolean;
}

async function announce(db: Db, orgId: string, a: MailAccount, deps: CompleteDeps) {
  const emit: Emit = deps.emit ?? (async (o, t, d, c) => (await import("@/lib/webhooks/outbound")).emitEvent(o, t, d, { db, envId: c?.envId }));
  await emit(orgId, "accountConnected", { accountId: a.id, externalId: a.externalId, email: a.email, provider: a.provider, backend: a.backend }, { envId: a.envId }).catch(() => {});
}

/** Tries to start push (Gmail watch with a topic, Graph subscription on a public https URL); otherwise the account stays in polling mode. */
async function tryPush(db: Db, a: MailAccount, deps: CompleteDeps): Promise<MailAccount> {
  if (a.backend === "imap") return a;
  const client = a.backend === "gmail_api" ? await db.getOAuthClient(a.envId, "google") : null;
  if (a.backend === "gmail_api" && !client?.pubsubTopic) return a;
  if (a.backend === "graph" && !appUrl().startsWith("https://")) return a;
  try {
    const pushAccount = { ...a, mode: "push" as const };
    const backend = await backendFor(db, pushAccount, deps);
    const info = await backend.watch().start();
    await backend.close();
    // The provider's own expiry when it gave one; Graph's subscription id is what push notifications are matched on.
    const watch = { id: info?.id ?? null, expiresAt: info?.expiresAt ?? new Date(Date.now() + (a.backend === "gmail_api" ? 7 : 3) * 86_400_000 - 3_600_000) };
    await db.updateAccount(a.id, { mode: "push", nextPollAt: null, watch });
    return { ...pushAccount, nextPollAt: null, watch };
  } catch {
    return a;
  }
}

/** 402 `mailbox_limit` before a NEW mailbox is added past a hard-capped plan (reconnecting an existing address is always allowed). */
export async function ensureCapacity(db: Db, envId: string, email: string | null) {
  if (email && (await db.findAccountByEmail(envId, email.toLowerCase()))) return;
  await assertCanAddMailbox(db, await orgOfEnv(db, envId));
}

/** Best effort: bill the extra mailboxes of a Growth subscription after the count changed. */
export async function billExtraMailboxes(db: Db, orgId: string) {
  const stripe = getStripe();
  if (!stripe) return;
  await syncExtraMailboxes(stripe, db, orgId).catch((e: Error) => log.warn("extra_mailbox_sync_failed", { message: e.message }));
}

async function register(db: Db, link: ConnectLink, a: { email: string; provider: MailAccount["provider"]; backend: MailAccount["backend"] }, creds: Parameters<Db["setCredentials"]>[0] extends infer C ? Omit<NonNullable<C>, "accountId"> : never, deps: CompleteDeps) {
  const orgId = await orgOfEnv(db, link.envId);
  const email = a.email.toLowerCase();
  const prev = await db.findAccountByEmail(link.envId, email);
  const acct = await db.upsertAccount({
    id: prev?.id ?? uuidv7(), envId: link.envId, externalId: link.externalId ?? prev?.externalId ?? email, email,
    provider: a.provider, backend: a.backend, state: "syncing", lastError: null, nextPollAt: new Date(), mode: "polling",
  });
  await db.setCredentials({ ...creds, accountId: acct.id });
  const final = await tryPush(db, acct, deps);
  await announce(db, orgId, final, deps);
  if (!prev && !deps.noBilling) await billExtraMailboxes(db, orgId);
  return final;
}

export function connectResult(link: ConnectLink, a: MailAccount) {
  const accountId = a.id;
  let redirectUrl: string | null = null;
  if (link.redirectUrl) {
    const u = new URL(link.redirectUrl);
    u.searchParams.set("account", accountId);
    if (link.externalId) u.searchParams.set("externalId", link.externalId);
    redirectUrl = u.toString();
  }
  return { accountId, email: a.email, redirectUrl };
}

/** IMAP/SMTP: verify first (wrong password = 422, link NOT burned), then consume the link and store encrypted settings. */
export async function completeImap(db: Db, link: ConnectLink, input: { email: string; imap: ImapSettings; smtp?: Omit<ImapSettings, "user" | "pass"> }, deps: CompleteDeps = {}) {
  await ensureCapacity(db, link.envId, input.email);
  // The typed address is not proven by an IMAP login on a server of the user's choice: never let it take over a
  // mailbox row that another end user (externalId) of this environment already owns.
  const prev = await db.findAccountByEmail(link.envId, input.email.toLowerCase());
  if (prev && prev.externalId !== (link.externalId ?? input.email.toLowerCase())) throw new HttpError(409, "mailbox_already_connected");
  // SSRF: the person holding a connect link must not make our servers dial loopback, private or metadata addresses.
  for (const h of [input.imap.host, input.smtp?.host]) {
    if (h) await assertPublicHost(h, { lookup: deps.lookup }).catch(() => { throw new HttpError(422, "mail_host_not_allowed", { host: h }); });
  }
  const backend = new ImapBackend(input.imap, deps.imapFactory ?? imapflowFactory);
  try {
    await backend.connect();
  } catch (e) {
    throw new HttpError(422, "imap_verification_failed", { reason: /auth|login|credential|password/i.test((e as Error).message) ? "authentication" : "connection" });
  } finally {
    await backend.close().catch(() => {});
  }
  if (!(await db.consumeConnectLink(link.id, deps.now ?? new Date()))) throw new HttpError(410, "link_used");
  const orgId = await orgOfEnv(db, link.envId);
  const enc = await sealForOrg(db, orgId, JSON.stringify({ imap: input.imap, smtp: input.smtp ? { ...input.smtp, user: input.imap.user, pass: input.imap.pass } : undefined }));
  const a = await register(db, link, { email: input.email, provider: "imap", backend: "imap" }, { imapSmtpEnc: enc }, deps);
  return connectResult(link, a);
}

/** OAuth callback success: consume the link, store encrypted tokens, create the account. */
export async function completeOAuth(db: Db, link: ConnectLink, provider: OAuthProvider, tokens: TokenSet, email: string, deps: CompleteDeps = {}) {
  await ensureCapacity(db, link.envId, email);
  if (!(await db.consumeConnectLink(link.id, deps.now ?? new Date()))) throw new HttpError(410, "link_used");
  const orgId = await orgOfEnv(db, link.envId);
  const a = await register(db, link, { email, provider, backend: provider === "google" ? "gmail_api" : "graph" }, {
    accessTokenEnc: await sealForOrg(db, orgId, tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? await sealForOrg(db, orgId, tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
  }, deps);
  return connectResult(link, a);
}
