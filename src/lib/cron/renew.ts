import { backendFor, type BackendDeps } from "@/lib/backends";
import { getDb } from "@/lib/db";
import type { Db, MailAccount } from "@/lib/db/types";

/** Gmail watches last 7 days, Graph subscriptions about 3: renew whatever expires within a day. */
export const RENEW_LEAD_MS = 24 * 3600 * 1000;
const RETRY_AFTER_MS = 10 * 60_000;

export interface RenewOptions extends BackendDeps { db?: Db; limit?: number; leadMs?: number; budgetMs?: number }
export interface RenewOutcome { accountId: string; ok: boolean; error?: string; fellBackToPolling?: boolean }

/**
 * `renew-watches`: re-registers the Gmail watch / renews the Graph subscription of every push account that is close to expiry
 * and stores the new expiry (and the Graph subscription id, which push notifications are matched on).
 * If renewal keeps failing and the old watch has run out, the account drops to polling so mail is not missed.
 */
export async function renewWatches(opts: RenewOptions = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const started = Date.now();
  const due = (await db.renewableAccounts(new Date(now.getTime() + (opts.leadMs ?? RENEW_LEAD_MS)), opts.limit ?? 50))
    .filter((a) => !a.watch?.retryAt || a.watch.retryAt <= now);
  const results: RenewOutcome[] = [];
  for (const a of due) {
    if (Date.now() - started > (opts.budgetMs ?? 45_000)) break;
    results.push(await renewOne(db, a, opts, now));
  }
  return { due: due.length, renewed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

async function renewOne(db: Db, a: MailAccount, opts: BackendDeps, now: Date): Promise<RenewOutcome> {
  let backend = null;
  try {
    backend = await backendFor(db, a, opts);
    const info = await backend.watch().start();
    await db.updateAccount(a.id, { watch: { id: info?.id ?? a.watch?.id ?? null, expiresAt: info?.expiresAt ?? new Date(now.getTime() + 3 * 86_400_000), retryAt: null } });
    return { accountId: a.id, ok: true };
  } catch (e) {
    const msg = ((e as Error).message || "renew_failed").slice(0, 200);
    const auth = /auth|oauth_|invalid_grant|no_credentials|login/i.test(msg);
    const expired = !!a.watch?.expiresAt && a.watch.expiresAt <= now;
    if (auth) { await db.updateAccount(a.id, { state: "authenticationError", lastError: msg, nextPollAt: null }); return { accountId: a.id, ok: false, error: msg }; }
    if (expired) {
      await db.updateAccount(a.id, { mode: "polling", nextPollAt: now, lastError: msg, watch: { id: a.watch?.id ?? null, expiresAt: null, retryAt: null } });
      return { accountId: a.id, ok: false, error: msg, fellBackToPolling: true };
    }
    await db.updateAccount(a.id, { lastError: msg, watch: { id: a.watch?.id ?? null, expiresAt: a.watch?.expiresAt ?? null, retryAt: new Date(now.getTime() + RETRY_AFTER_MS) } });
    return { accountId: a.id, ok: false, error: msg };
  } finally {
    await backend?.close().catch(() => {});
  }
}
