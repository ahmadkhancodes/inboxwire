/**
 * THE single source of product identity, plans, limits, flags and copy constants.
 * KIT_COPY.md step 2: a new product edits this file (and the tokens in globals.css) and nothing else in src/lib.
 */

export type PlanId = "free" | "starter" | "growth" | "selfhost";
export type Interval = "month" | "year";
export type MeterId = "mailboxes" | "environments" | "seats" | "log_days" | "events";

export interface PlanPrice {
  interval: Interval;
  /** USD cents. Real prices only (playbook §2). */
  usd: number;
  /** Stripe lookup key, always `${product.slug}_${plan}_${interval}` (app isolation, C-28). */
  lookupKey: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Empty for the free plan. */
  prices: PlanPrice[];
  limits: Record<MeterId, number>;
  /** Short plain-text differences shown in the pricing table. */
  highlights: string[];
  cta: string;
  featured?: boolean;
  /** Days of trial. 0 = no trial (Inboxwire: the Free plan is the trial). */
  trialDays: number;
}

const slug = "inboxwire";
const UNLIMITED = 1_000_000_000;
const price = (plan: PlanId, interval: Interval, usd: number): PlanPrice => ({
  interval,
  usd,
  lookupKey: `${slug}_${plan}_${interval === "month" ? "monthly" : "annual"}`,
});

export const product = {
  slug,
  name: "Inboxwire",
  fullName: "Inboxwire by BufferSol",
  company: "BufferSol Technologies",
  companyUrl: "https://buffersoltech.com",
  host: "inboxwire.buffersoltech.com",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxwire.buffersoltech.com",
  supportEmail: "support@buffersoltech.com",
  legalEmail: "legal@buffersoltech.com",
  mailFrom: "Inboxwire by BufferSol <no-reply@inboxwire.buffersoltech.com>",
  description:
    "One REST API and signed webhooks over your users' Gmail, Microsoft 365 and IMAP mailboxes. Run it on your servers for $708 a year, or let us run it from $24.99 a month.",
  tagline: "Your users' Gmail, Outlook and IMAP: one API, every line watched",
  /** Legal entity details used by the legal templates. */
  legal: {
    entity: "BufferSol Technologies",
    jurisdiction: "{{jurisdiction}}",
    address: "{{registered address}}",
    effectiveDate: "2026-11-05",
  },
  subProcessors: [
    { name: "Vercel Inc.", purpose: "Hosting and edge network", location: "United States" },
    { name: "MongoDB Inc. (Atlas)", purpose: "Database hosting", location: "United States (AWS us-east-1)" },
    { name: "Stripe Inc.", purpose: "Payments and invoicing", location: "United States" },
    { name: "Email delivery provider", purpose: "Platform emails (sign-in links, alerts) until our own mail servers are live", location: "United States" },
  ],
  currency: "usd" as const,
  /** Default billing interval shown first in the pricing toggle (annual pre-selected, brief sheet 07). */
  defaultInterval: "year" as Interval,
  plans: [
    {
      id: "free",
      name: "Developer",
      tagline: "Free forever, for a first integration",
      prices: [],
      limits: { mailboxes: 3, environments: 1, seats: 3, log_days: 7, events: UNLIMITED },
      highlights: ["3 mailboxes forever", "All API features", "Self-host or Cloud", "Community support", "No card"],
      cta: "Start free",
      trialDays: 0,
    },
    {
      id: "starter",
      name: "Cloud Starter",
      tagline: "We host it, for your first customers",
      prices: [price("starter", "month", 2499)],
      limits: { mailboxes: 25, environments: 1, seats: 3, log_days: 30, events: UNLIMITED },
      highlights: ["25 mailboxes", "Bring your own OAuth clients", "US region", "30 day webhook delivery log", "1 environment"],
      cta: "Choose Cloud Starter",
      trialDays: 0,
    },
    {
      id: "growth",
      name: "Cloud Growth",
      tagline: "We host it, for a growing customer base",
      prices: [price("growth", "month", 9999), price("growth", "year", 104388)],
      limits: { mailboxes: 100, environments: 3, seats: 10, log_days: 90, events: UNLIMITED },
      highlights: ["100 mailboxes, $0.99 per extra", "3 environments", "90 day delivery log", "Priority support, 1 business day", "Remove connect page badge"],
      cta: "Choose Cloud Growth",
      featured: true,
      trialDays: 0,
    },
    {
      id: "selfhost",
      name: "Self-host",
      tagline: "Run it on your servers",
      prices: [price("selfhost", "month", 5999), price("selfhost", "year", 70800)],
      limits: { mailboxes: UNLIMITED, environments: UNLIMITED, seats: UNLIMITED, log_days: UNLIMITED, events: UNLIMITED },
      highlights: ["Unlimited instances and mailboxes", "Unlimited API calls", "All updates", "Email support, 2 business days", "Price locked 24 months"],
      cta: "Choose Self-host",
      trialDays: 0,
    },
  ] satisfies Plan[],
  /** Extra mailbox over the Cloud Growth allowance. USD cents per month, prorated daily (Stripe price docs/STRIPE.md). */
  extraMailbox: { usd: 99, lookupKey: `${slug}_extra_mailbox_monthly`, plan: "growth" as PlanId },
  /** Grace period after a failed payment (past_due keeps the plan, C-20) before limits fall to Free. */
  graceDays: 7,
  /** Remote flag defaults (overridden by APP_FLAGS env JSON and the Mongo `config` collection). */
  flags: {
    payments_enabled: "on",
    signups_enabled: "on",
    maintenance: "off",
  } as Record<string, string>,
  nav: [
    { href: "/docs", label: "Docs" },
    { href: "/pricing", label: "Pricing" },
    { href: "/compare", label: "Compare" },
    { href: "/status", label: "Status" },
  ],
} as const;

export type Product = typeof product;
export const plans: readonly Plan[] = product.plans;
export const planById = (id: string): Plan | undefined => plans.find((p) => p.id === id);
export const freePlan = plans.find((p) => p.prices.length === 0) ?? plans[0]!;
export const allLookupKeys = (): string[] => plans.flatMap((p) => p.prices.map((x) => x.lookupKey));
export const planForLookupKey = (key: string | null | undefined): { plan: Plan; price: PlanPrice } | null => {
  if (!key) return null;
  for (const plan of plans) for (const p of plan.prices) if (p.lookupKey === key) return { plan, price: p };
  return null;
};
