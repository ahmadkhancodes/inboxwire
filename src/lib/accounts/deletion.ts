import { createHash } from "node:crypto";
import { backendFor, type BackendDeps } from "@/lib/backends";
import type { DeletionRecord, Db, MailAccount } from "@/lib/db/types";
import { uuidv7 } from "@/lib/ids";
import { log } from "@/lib/logger";
import { openForOrg, orgOfEnv } from "@/lib/secrets";

// Account deletion (DELETE /v1/accounts/{id}) and the 30 day post-cancellation purge share this flow:
// stop the provider watch, revoke the token where the provider offers it, delete every row, write a deletion_record.

export const PURGE_AFTER_CANCEL_DAYS = 30;
const sha = (s: string) => createHash("sha256").update(s.toLowerCase()).digest("hex");

export interface DeleteDeps extends BackendDeps {
  /** Revokes a Google token. Default: POST https://oauth2.googleapis.com/revoke. */
  revokeGoogle?: (token: string) => Promise<boolean>;
  now?: Date;
}

async function defaultRevokeGoogle(token: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const r = await fetchFn("https://oauth2.googleapis.com/revoke", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }),
  });
  return r.ok;
}

export async function revokeAccess(db: Db, account: MailAccount, deps: DeleteDeps): Promise<DeletionRecord["revocation"]> {
  const cred = await db.getCredentials(account.id);
  // Stop push first so no notification arrives for a mailbox we are deleting (best effort: the token may already be dead).
  if (account.mode === "push") {
    try { const b = await backendFor(db, account, deps); await b.watch().stop(); await b.close(); } catch (e) { log.warn("delete_watch_stop_failed", { message: (e as Error).message }); }
  }
  if (account.backend !== "gmail_api") return "not_applicable";
  if (!cred?.refreshTokenEnc && !cred?.accessTokenEnc) return "not_applicable";
  try {
    const orgId = await orgOfEnv(db, account.envId);
    const token = await openForOrg(db, orgId, (cred.refreshTokenEnc ?? cred.accessTokenEnc)!);
    return (await (deps.revokeGoogle ?? ((t) => defaultRevokeGoogle(t, deps.fetchFn)))(token)) ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}

export async function deleteAccount(db: Db, account: MailAccount, reason: DeletionRecord["reason"], deps: DeleteDeps = {}): Promise<DeletionRecord> {
  const orgId = await orgOfEnv(db, account.envId);
  const revocation = await revokeAccess(db, account, deps);
  const deleted = await db.deleteAccountData(account.id);
  const rec = await db.addDeletionRecord({ id: uuidv7(), orgId, envId: account.envId, accountId: account.id, emailHash: sha(account.email), reason, revocation, deleted, at: deps.now });
  await db.appendAudit({ orgId, actorId: null, action: "account.deleted", target: account.id, meta: { reason, revocation }, at: deps.now });
  return rec;
}

/** Deletes the mailboxes of every org whose paid plan was canceled at least 30 days ago. Idempotent: orgs without mailboxes are skipped. */
export async function purgeCanceled(db: Db, deps: DeleteDeps & { days?: number; limit?: number } = {}) {
  const now = deps.now ?? new Date();
  const cutoff = now.getTime() - (deps.days ?? PURGE_AFTER_CANCEL_DAYS) * 86_400_000;
  const orgs = await db.listCanceledEntitlements(cutoff);
  let purged = 0, accounts = 0;
  for (const { orgId } of orgs) {
    let any = false;
    for (const env of await db.listEnvironments(orgId)) {
      for (const a of await db.listAccounts(env.id)) {
        if (accounts >= (deps.limit ?? 200)) return { orgs: purged, accounts, more: true };
        await deleteAccount(db, a, "post_cancel_purge", { ...deps, now });
        accounts++; any = true;
      }
    }
    if (any) purged++;
  }
  return { orgs: purged, accounts, more: false };
}

/** Org deletion: every mailbox goes through the same revoke + delete + deletion_record flow before the org's rows are dropped. */
export async function deleteOrgMailboxes(db: Db, orgId: string, deps: DeleteDeps = {}) {
  let n = 0;
  for (const env of await db.listEnvironments(orgId)) {
    for (const a of await db.listAccounts(env.id)) { await deleteAccount(db, a, "org_deleted", deps); n++; }
  }
  return n;
}
