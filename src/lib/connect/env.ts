import { authApiKey } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { Db, EnvName } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { requireScope, type Scope } from "@/lib/auth/scopes";

const NAMES: EnvName[] = ["development", "staging", "production"];

/** API-key auth for /v1: the key's org plus an environment chosen by `x-environment` (default production). `need` is the scope the route requires (403 insufficient_scope). */
export async function authEnv(req: Request, need: Scope, db?: Db) {
  const { orgId, keyId, scopes } = await authApiKey(req);
  requireScope(scopes, need);
  const d = db ?? (await getDb());
  const name = (req.headers.get("x-environment") ?? "production") as EnvName;
  if (!NAMES.includes(name)) throw new HttpError(400, "invalid_environment");
  const env = await d.ensureEnvironment(orgId, name);
  return { orgId, keyId, scopes, env, db: d };
}
