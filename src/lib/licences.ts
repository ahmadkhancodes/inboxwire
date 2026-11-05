import { createPrivateKey, createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Db, LicenceRecord } from "@/lib/db/types";
import { uuidv7 } from "@/lib/ids";
import { check, issue, type LicencePayload, type LicenceStatus } from "@/lib/mailcore/licence";

// Self-host licences: Ed25519, verified offline. The private key only exists in the cloud environment
// (`LICENCE_SIGNING_KEY`, PKCS8 PEM; `\n` escapes are accepted); the image carries the public key.

const pem = (v: string) => v.replace(/\\n/g, "\n").trim();

export function signingKey(source: Record<string, string | undefined> = process.env): string | null {
  const v = source.LICENCE_SIGNING_KEY;
  return v ? pem(v) : null;
}

/** Public key: `LICENCE_PUBLIC_KEY` if set, else derived from the signing key. */
export function publicKey(source: Record<string, string | undefined> = process.env): string | null {
  if (source.LICENCE_PUBLIC_KEY) return pem(source.LICENCE_PUBLIC_KEY);
  const priv = signingKey(source);
  return priv ? (createPublicKey(createPrivateKey(priv)).export({ type: "spki", format: "pem" }) as string) : null;
}

export interface IssueInput { orgId: string; invoiceId: string; expiresAt: Date; now?: Date; privateKeyPem?: string | null }

/** Issues (once per invoice) a self-host licence. Null when no signing key is configured. A repeat of the same invoice returns the existing key. */
export async function issueSelfhostLicence(db: Db, i: IssueInput): Promise<{ licence: LicenceRecord; created: boolean } | null> {
  const priv = i.privateKeyPem === undefined ? signingKey() : i.privateKeyPem;
  if (!priv) return null;
  const now = i.now ?? new Date();
  const id = uuidv7();
  const payload: LicencePayload = {
    id, org: i.orgId, plan: "selfhost", issuedAt: Math.floor(now.getTime() / 1000), expiresAt: Math.floor(i.expiresAt.getTime() / 1000),
    features: ["unlimited_mailboxes", "unlimited_instances", "updates"],
  };
  return db.insertLicence({ id, orgId: i.orgId, plan: "selfhost", invoiceId: i.invoiceId, key: issue(priv, payload), issuedAt: now, expiresAt: i.expiresAt });
}

export interface LicenceView {
  id: string;
  key: string;
  status: LicenceStatus["status"];
  issuedAt: string;
  expiresAt: string;
  /** End of the 30 day read-only grace window. */
  graceEndsAt: string;
  reason?: string;
}

export const GRACE_DAYS = 30;

export function licenceView(l: LicenceRecord, pub: string | null, now = new Date()): LicenceView {
  const st = pub ? check(pub, l.key, Math.floor(now.getTime() / 1000)) : { status: "invalid" as const, reason: "no public key configured" };
  return {
    id: l.id, key: l.key, status: l.revokedAt ? "invalid" : st.status, issuedAt: l.issuedAt.toISOString(), expiresAt: l.expiresAt.toISOString(),
    graceEndsAt: new Date(l.expiresAt.getTime() + GRACE_DAYS * 86_400_000).toISOString(), reason: l.revokedAt ? "revoked" : st.reason,
  };
}

export async function orgLicences(db: Db, orgId: string, now = new Date()): Promise<LicenceView[]> {
  const pub = publicKey();
  return (await db.listLicences(orgId)).map((l) => licenceView(l, pub, now));
}

// ----- the instance's own licence (self-host image) -----

/** Public key an instance verifies with: `LICENCE_PUBLIC_KEY`, else the file at `LICENCE_PUBLIC_KEY_FILE` (the image ships /app/licence-public.pem). */
export function instancePublicKey(source: Record<string, string | undefined> = process.env): string | null {
  if (source.LICENCE_PUBLIC_KEY) return pem(source.LICENCE_PUBLIC_KEY);
  const file = source.LICENCE_PUBLIC_KEY_FILE ?? "/app/licence-public.pem";
  try { return existsSync(file) ? readFileSync(file, "utf8").trim() : null; } catch { return null; }
}

let memo: { key: string; pub: string | null; minute: number; res: LicenceStatus } | null = null;

/** Status of `INBOXWIRE_LICENCE` (null when the instance has none, i.e. the hosted app or an unlicensed self-host). Verified offline, cached for a minute. */
export function instanceLicence(now = Date.now(), source: Record<string, string | undefined> = process.env): LicenceStatus | null {
  const key = source.INBOXWIRE_LICENCE?.trim();
  if (!key) return null;
  const minute = Math.floor(now / 60_000);
  const pub = instancePublicKey(source);
  if (memo && memo.key === key && memo.pub === pub && memo.minute === minute) return memo.res;
  const res: LicenceStatus = pub ? check(pub, key, Math.floor(now / 1000)) : { status: "invalid", reason: "no licence public key on this instance" };
  memo = { key, pub, minute, res };
  return res;
}
