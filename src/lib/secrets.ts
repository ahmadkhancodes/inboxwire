import { createHash } from "node:crypto";
import type { Db } from "@/lib/db/types";
import { crypto as mc } from "@/lib/mailcore";

// Envelope encryption (ARCHITECTURE section 3): a per-org data key (DEK) wrapped by MASTER_KEY (KeyWrapper interface,
// OpenBao later). Credentials, OAuth client secrets and tokens are only ever stored as `encrypt(dek, text)`.

export function masterKey(source: Record<string, string | undefined> = process.env): Buffer {
  const raw = source.MASTER_KEY;
  if (raw) {
    const b = Buffer.from(raw, "base64");
    if (b.length !== 32) throw new Error("MASTER_KEY must be 32 bytes, base64 encoded");
    return b;
  }
  if (source.NODE_ENV === "production" && source.DB_DRIVER !== "memory") throw new Error("MASTER_KEY is required in production");
  // Dev/test only: derive from the auth secret so stub mode works without extra setup.
  return createHash("sha256").update(`inboxwire-dev-master:${source.BETTER_AUTH_SECRET ?? "dev"}`).digest();
}

export const keyWrapper = (source?: Record<string, string | undefined>): mc.KeyWrapper => new mc.EnvKeyWrapper(masterKey(source));

async function orgDek(db: Db, orgId: string, w: mc.KeyWrapper): Promise<Buffer> {
  const existing = await db.getOrgKey(orgId);
  if (existing) return w.unwrap(Buffer.from(existing.wrappedDek, "base64"));
  const fresh = mc.newDataKey(w);
  const winner = await db.putOrgKey(orgId, fresh.wrapped.toString("base64"));
  return w.unwrap(Buffer.from(winner.wrappedDek, "base64"));
}

export async function sealForOrg(db: Db, orgId: string, plain: string, w: mc.KeyWrapper = keyWrapper()): Promise<string> {
  return mc.encrypt(await orgDek(db, orgId, w), plain);
}

export async function openForOrg(db: Db, orgId: string, blob: string, w: mc.KeyWrapper = keyWrapper()): Promise<string> {
  return mc.decrypt(await orgDek(db, orgId, w), blob);
}

/** Org that owns an environment (needed to pick the right data key for an account or OAuth client). */
export async function orgOfEnv(db: Db, envId: string): Promise<string> {
  const e = await db.getEnvironment(envId);
  if (!e) throw new Error("unknown_environment");
  return e.orgId;
}

/** Deterministic per-environment token for provider push hooks (Gmail `?token=`, Graph `clientState`). */
export function hookToken(envId: string, source: Record<string, string | undefined> = process.env): string {
  return createHash("sha256").update(masterKey(source)).update(`|hook|${envId}`).digest("base64url");
}
