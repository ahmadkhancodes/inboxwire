import { createHash } from "node:crypto";
import type { Db } from "@/lib/db/types";
import { clientIp, readBodyText } from "@/lib/http";
import { rateLimit, RULES, type Rule } from "./ratelimit";

/**
 * Limits for Better Auth endpoints that send an e-mail to an address the caller types. Better Auth's own limiter is per
 * IP only (3 per 10 s on /sign-in/*), and IPs are cheap: rotating them let anyone flood a stranger's inbox with sign-in
 * links or invitations sent from our domain. The per-address limit holds however many IPs the attacker has; the victim
 * still receives working links, so it cannot lock them out.
 */
export const MAIL_PATHS: Record<string, { email: Rule; ip: Rule }> = {
  "/sign-in/magic-link": { email: RULES.authEmail, ip: RULES.authIp },
  "/organization/invite-member": { email: RULES.authEmail, ip: RULES.authIp },
};

/** `null` = let Better Auth handle it; otherwise the 429 to return. The request body is read from a clone. */
export async function guardAuthMail(req: Request, db: Db): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "").replace(/\/+$/, "");
  const rule = MAIL_PATHS[path];
  if (!rule) return null;
  let email = "";
  try {
    const text = await readBodyText(req.clone());
    const body = JSON.parse(text) as { email?: unknown };
    if (typeof body?.email === "string") email = body.email.trim().toLowerCase().slice(0, 320);
  } catch {
    return null; // Better Auth answers malformed or oversized bodies itself
  }
  const checks: [string, Rule][] = [[`mail-ip:${path}:${clientIp(req)}`, rule.ip]];
  // Shared across both paths (one inbox, one budget); hashed so the limiter store holds no addresses.
  if (email) checks.push([`mail-to:${createHash("sha256").update(email).digest("base64url")}`, rule.email]);
  for (const [key, r] of checks) {
    const res = await rateLimit(key, r, db);
    if (!res.ok) {
      return new Response(JSON.stringify({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please try again later." }), {
        status: 429,
        headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": String(Math.ceil(r.windowMs / 1000)) },
      });
    }
  }
  return null;
}
