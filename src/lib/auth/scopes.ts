import { HttpError } from "@/lib/http";

/** Per-key scopes stored in the Better Auth key's `metadata.scopes`. admin includes send, send includes read. */
export const SCOPES = ["read", "send", "admin"] as const;
export type Scope = (typeof SCOPES)[number];

const RANK: Record<Scope, number> = { read: 1, send: 2, admin: 3 };

/** Keys created before scopes existed carry no metadata and keep full access; a malformed list grants nothing. */
export function parseScopes(metadata: unknown): Scope[] {
  let m = metadata;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { return []; } }
  const raw = (m as { scopes?: unknown } | null | undefined)?.scopes;
  if (raw === undefined) return [...SCOPES];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s as string));
}

export const hasScope = (granted: readonly Scope[], need: Scope) => granted.some((g) => RANK[g] >= RANK[need]);

/** 403 `insufficient_scope` unless one of the granted scopes covers `need`. */
export function requireScope(granted: readonly Scope[], need: Scope): void {
  if (!hasScope(granted, need)) throw new HttpError(403, "insufficient_scope", { required: need });
}

const ENVS = ["development", "staging", "production"] as const;
/** Optional environment a key is bound to (`metadata.environment`). Unset = any environment of the org (keys made before M5). An unknown value binds to nothing. */
export function parseKeyEnvironment(metadata: unknown): (typeof ENVS)[number] | "none" | null {
  let m = metadata;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { return null; } }
  const raw = (m as { environment?: unknown } | null | undefined)?.environment;
  if (raw === undefined || raw === null) return null;
  return (ENVS as readonly unknown[]).includes(raw) ? (raw as (typeof ENVS)[number]) : "none";
}
