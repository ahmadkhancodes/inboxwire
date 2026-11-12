import type { Db, Environment, MailAccount } from "@/lib/db/types";
import { authEnv } from "@/lib/connect/env";
import type { Scope } from "@/lib/auth/scopes";
import { backendFor, type BackendDeps } from "@/lib/backends";
import { HttpError, withApi } from "@/lib/http";
import type { MailBackend } from "@/lib/mailcore";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export interface V1Ctx { orgId: string; keyId: string; env: Environment; db: Db }

/** A `/v1` route: API key auth with the scope it needs, the key's environment, rate limit, JSON errors. */
export function v1<C = unknown>(need: Scope, fn: (a: V1Ctx, req: Request, ctx: C) => Promise<Response>) {
  return withApi<C>(async (req, ctx) => {
    const { orgId, keyId, env, db } = await authEnv(req, need);
    await enforceRateLimit(`api:${keyId}`, RULES.api, db);
    return fn({ orgId, keyId, env, db }, req, ctx);
  }, { csrf: false });
}

/** Account of the key's environment, or 404 (an id from another environment or org looks the same as a missing one). */
export async function loadAccount(db: Db, env: Environment, id: string): Promise<MailAccount> {
  const a = await db.getAccount(id);
  if (!a || a.envId !== env.id) throw new HttpError(404, "account_not_found");
  return a;
}

/** Maps a provider's error text to a stable code. The text itself is never returned (it can carry hostnames or tokens). */
export function providerReason(msg: string): string {
  if (/auth|invalid_grant|unauthori[sz]ed|401|403|login|credentials|forbidden/i.test(msg)) return "authentication";
  if (/rate|quota|429|too many|throttl/i.test(msg)) return "rate_limited";
  if (/timed? ?out|etimedout|abort/i.test(msg)) return "timeout";
  if (/econn|enotfound|eai_again|connect|socket|network|tls|ssl|5\d\d/i.test(msg)) return "connection";
  return "unknown";
}

/** Runs `fn` with the account's backend and always closes it. Provider failures become 502 `provider_error`, not 500. */
export async function withBackend<T>(db: Db, account: MailAccount, fn: (b: MailBackend) => Promise<T>, deps: BackendDeps = {}): Promise<T> {
  const backend = await backendFor(db, account, deps).catch((e: Error) => { throw new HttpError(409, "account_unavailable", { reason: providerReason(e.message) }); });
  try {
    return await fn(backend);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = (e as Error).message ?? "";
    if (/not_found|404/i.test(msg)) throw new HttpError(404, "not_found");
    if (/invalid_cursor/.test(msg)) throw new HttpError(400, "invalid_cursor");
    throw new HttpError(502, "provider_error", { reason: providerReason(msg) });
  } finally {
    await backend.close().catch(() => {});
  }
}
