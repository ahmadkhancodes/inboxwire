import type { Interval, Plan } from "@/config/product";

/** The product's real app entry. */
export const APP_HOME = "/app";
export const APP_LABEL = "Open dashboard";

export interface CtaTarget { href: string; label: string }

/** Pricing button for a plan: signed-out visitors go through sign-in with the plan hand-off, signed-in ones skip it. */
export function pricingCta(plan: Pick<Plan, "id" | "cta">, interval: Interval, signedIn: boolean): CtaTarget {
  if (!signedIn) return { href: `/sign-in?plan=${plan.id}&interval=${interval}`, label: plan.cta };
  if (plan.id === "free") return { href: APP_HOME, label: APP_LABEL };
  return { href: `/app/billing?plan=${plan.id}&interval=${interval}`, label: plan.cta };
}

/** Generic call to action: signed-in visitors get the dashboard instead of the signup label. */
export function sessionCta(base: CtaTarget, signedIn: boolean): CtaTarget {
  return signedIn ? { href: APP_HOME, label: APP_LABEL } : base;
}
