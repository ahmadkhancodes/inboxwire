import { authApiKey } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { Db, EnvName } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { effectivePlan } from "@/lib/billing/entitlement";
import { requireScope, type Scope } from "@/lib/auth/scopes";

const NAMES: EnvName[] = ["development", "staging", "production"];

/** API-key auth for /v1: the key's org plus an environment chosen by `x-environment` (default production). `need` is the scope the route requires (403 insufficient_scope). */
export async function authEnv(req: Request, need: Scope, db?: Db) {
  const { orgId, keyId, scopes, environment } = await authApiKey(req);
  requireScope(scopes, need);
  const d = db ?? (await getDb());
  const header = req.headers.get("x-environment");
  const name = (header ?? (environment && environment !== "none" ? environment : "production")) as EnvName;
  if (!NAMES.includes(name)) throw new HttpError(400, "invalid_environment");
  // A key bound to an environment cannot reach another one (a leaked development key never touches production).
  if (environment && environment !== name) throw new HttpError(403, "environment_not_allowed", { keyEnvironment: environment === "none" ? null : environment });
  const env = await environmentWithinPlan(d, orgId, name);
  return { orgId, keyId, scopes, env, db: d };
}

/**
 * The org's environment `name`, created only if the plan has room. Plans sell 1, 3 or unlimited environments: a plan at
 * its limit cannot create another one (existing ones stay reachable). Every path that can create an environment (API
 * keys, dashboard OAuth-client screens) must come through here, or a Free org gets three environments for nothing.
 */
export async function environmentWithinPlan(d: Db, orgId: string, name: EnvName) {
  const have = await d.listEnvironments(orgId);
  if (!have.some((e) => e.name === name)) {
    const limit = effectivePlan(await d.getEntitlement(orgId), Date.now()).limits.environments;
    if (have.length >= limit) throw new HttpError(402, "environment_limit", { limit, used: have.length });
  }
  return d.ensureEnvironment(orgId, name);
}
