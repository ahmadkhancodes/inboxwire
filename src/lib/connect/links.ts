import type { Db } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/ids";

export const CONNECT_LINK_TTL_MS = 24 * 3600 * 1000;

/** redirectUrl must be https (http only for localhost) so a link cannot bounce users to a javascript:/data: URL. */
export function isSafeRedirect(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch { return false; }
}

export async function createConnectLink(db: Db, p: { envId: string; externalId?: string | null; redirectUrl?: string | null; email?: string | null; now?: Date }) {
  if (p.redirectUrl && !isSafeRedirect(p.redirectUrl)) throw new HttpError(400, "invalid_redirect_url");
  const now = p.now ?? new Date();
  const token = `cl_${randomToken(32)}`;
  const link = await db.createConnectLink({
    id: await sha256(token), envId: p.envId, externalId: p.externalId ?? null, redirectUrl: p.redirectUrl ?? null,
    email: p.email ?? null, expiresAt: new Date(now.getTime() + CONNECT_LINK_TTL_MS),
  });
  return { token, expiresAt: link.expiresAt };
}

export type LinkLookup = { ok: true; link: NonNullable<Awaited<ReturnType<Db["getConnectLink"]>>> } | { ok: false; status: 404 | 410; reason: "not_found" | "expired" | "used" };

/** Read-only check (the hosted page and start routes). 404 unknown, 410 used or expired. */
export async function lookupConnectLink(db: Db, token: string, now = new Date()): Promise<LinkLookup> {
  const link = await db.getConnectLink(await sha256(token));
  if (!link) return { ok: false, status: 404, reason: "not_found" };
  if (link.usedAt) return { ok: false, status: 410, reason: "used" };
  if (link.expiresAt <= now) return { ok: false, status: 410, reason: "expired" };
  return { ok: true, link };
}

export function assertLink(r: LinkLookup) {
  if (!r.ok) throw new HttpError(r.status, r.status === 404 ? "link_not_found" : `link_${r.reason}`);
  return r.link;
}
