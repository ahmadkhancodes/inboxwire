import type { Interval } from "@/config/product";
import { planById } from "@/config/product";

/**
 * Same-origin paths only. Anything else (absolute URLs, //host, backslashes) falls back. Control characters are refused
 * too: the URL parser drops tab/CR/LF, so `/\t/evil.com` (sent as `?next=/%09/evil.com`) becomes `//evil.com` in the
 * browser. The final check resolves the path the way a browser would and keeps it only if the origin is unchanged.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || next.length > 2048 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    if (new URL(next, "https://self.invalid").origin !== "https://self.invalid") return fallback;
  } catch {
    return fallback;
  }
  return next;
}

/** Where to go after sign-in: pricing hand-off (?plan&interval) wins, then ?next, then /app. */
export function afterSignIn(p: { next?: string | null; plan?: string | null; interval?: string | null }): string {
  const plan = p.plan ? planById(p.plan) : undefined;
  if (plan && plan.id !== "free") {
    const interval: Interval = p.interval === "month" ? "month" : "year";
    return `/app/billing?plan=${plan.id}&interval=${interval}`;
  }
  return safeNext(p.next);
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace";
