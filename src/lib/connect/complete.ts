import { backendFor, type BackendDeps } from "@/lib/backends";
import { ImapBackend, imapflowFactory, type ImapFactory, type ImapSettings } from "@/lib/backends/imap";
import type { ConnectLink, Db, MailAccount, OAuthProvider } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { orgOfEnv, sealForOrg } from "@/lib/secrets";
import type { TokenSet } from "./oauth";

export interface CompleteDeps extends BackendDeps {
  emit?: (orgId: string, type: string, data: unknown) => Promise<unknown>;
  imapFactory?: ImapFactory;
}

async function announce(db: Db, orgId: string, a: MailAccount, deps: CompleteDeps) {
  const emit = deps.emit ?? (async (o: string, t: string, d: unknown) => (await import("@/lib/webhooks/outbound")).emitEvent(o, t, d, { db }));
  await emit(orgId, "accountConnected", { accountId: a.id, externalId: a.externalId, email: a.email, provider: a.provider, backend: a.backend }).catch(() => {});
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
    await backend.watch().start();
    await backend.close();
    const watch = { id: null, expiresAt: new Date(Date.now() + (a.backend === "gmail_api" ? 7 : 3) * 86_400_000 - 3_600_000) };
    await db.updateAccount(a.id, { mode: "push", nextPollAt: null, watch });
    return { ...pushAccount, nextPollAt: null, watch };
  } catch {
    return a;
  }
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
  if (!(await db.consumeConnectLink(link.id, deps.now ?? new Date()))) throw new HttpError(410, "link_used");
  const orgId = await orgOfEnv(db, link.envId);
  const a = await register(db, link, { email, provider, backend: provider === "google" ? "gmail_api" : "graph" }, {
    accessTokenEnc: await sealForOrg(db, orgId, tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? await sealForOrg(db, orgId, tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
  }, deps);
  return connectResult(link, a);
}
