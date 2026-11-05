import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db/types";
import { syncAccount, type BackendDeps } from "@/lib/backends";

export interface PollOptions extends BackendDeps {
  db?: Db;
  limit?: number;
  /** Stop starting new accounts after this budget (function time limit is 60 s). */
  budgetMs?: number;
  /** Shard i of n by account id hash so parallel cron invocations never overlap. */
  shard?: { index: number; total: number };
  emit?: (orgId: string, type: string, data: unknown) => Promise<unknown>;
  pollEveryMs?: number;
}

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

/** `poll-imap`: short sessions for every account in polling mode that is due (IMAP, plus Gmail/Graph without push). */
export async function pollDueAccounts(opts: PollOptions = {}) {
  const db = opts.db ?? (await getDb());
  const started = Date.now();
  const now = opts.now ?? new Date();
  const due = (await db.dueAccounts(now, opts.limit ?? 50)).filter((a) => !opts.shard || hash(a.id) % opts.shard.total === opts.shard.index);
  const results = [];
  for (const a of due) {
    if (Date.now() - started > (opts.budgetMs ?? 45_000)) break;
    // Claim: push nextPollAt out first so an overlapping invocation skips this account.
    await db.updateAccount(a.id, { nextPollAt: new Date(now.getTime() + 120_000) });
    results.push(await syncAccount(db, a.id, opts));
  }
  return { due: due.length, polled: results.length, failed: results.filter((r) => !r.ok).length, events: results.reduce((n, r) => n + r.events, 0) };
}
