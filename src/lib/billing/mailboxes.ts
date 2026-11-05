import type Stripe from "stripe";
import { product, type Plan } from "@/config/product";
import type { Db } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { effectivePlan } from "./entitlement";
import { countMailboxes, usageState, type UsageState } from "./usage";

// Active-mailbox metering. A mailbox is an account row in any environment of the org, so the dashboard meter,
// `GET /v1/usage` and the Stripe quantity all read the same number (workbook: "usage matches meter").

const UNLIMITED_AT = 1_000_000;

export type MailboxMode = "hard_cap" | "metered" | "unlimited";

export interface MailboxUsage {
  plan: Pick<Plan, "id" | "name">;
  mode: MailboxMode;
  used: number;
  included: number;
  /** Mailboxes above the allowance that are billed at the extra-mailbox price (metered plans only). */
  extra: number;
  extraPriceCents: number;
  estimatedExtraCents: number;
  state: UsageState;
  /** True when one more mailbox can be connected (a hard-capped plan at its limit cannot). */
  canAdd: boolean;
}

export { countMailboxes };

export function mailboxUsageFor(plan: Plan, used: number): MailboxUsage {
  const included = plan.limits.mailboxes;
  const mode: MailboxMode = included >= UNLIMITED_AT ? "unlimited" : plan.id === product.extraMailbox.plan ? "metered" : "hard_cap";
  const extra = mode === "metered" ? Math.max(0, used - included) : 0;
  return {
    plan: { id: plan.id, name: plan.name },
    mode,
    used,
    included,
    extra,
    extraPriceCents: mode === "metered" ? product.extraMailbox.usd : 0,
    estimatedExtraCents: extra * (mode === "metered" ? product.extraMailbox.usd : 0),
    state: usageState("mailboxes", used, included),
    canAdd: mode !== "hard_cap" || used < included,
  };
}

export async function mailboxUsage(db: Db, orgId: string, now = new Date()): Promise<MailboxUsage> {
  const plan = effectivePlan(await db.getEntitlement(orgId), now.getTime());
  return mailboxUsageFor(plan, await countMailboxes(db, orgId));
}

/** 402 `mailbox_limit` when a hard-capped plan is full. Metered (Growth) and unlimited plans always pass. */
export async function assertCanAddMailbox(db: Db, orgId: string, now = new Date()): Promise<MailboxUsage> {
  const u = await mailboxUsage(db, orgId, now);
  if (!u.canAdd) throw new HttpError(402, "mailbox_limit", { plan: u.plan.id, limit: u.included, used: u.used });
  return u;
}

type StripeSubs = Pick<Stripe, "subscriptions" | "subscriptionItems" | "prices">;

/**
 * Brings the extra-mailbox line of the org's Stripe subscription to `extra` units (create, update or remove).
 * Returns the quantity now billed, or null when there is nothing to sync (no subscription / not a metered plan).
 */
export async function syncExtraMailboxes(stripe: StripeSubs, db: Db, orgId: string, usage?: MailboxUsage): Promise<number | null> {
  const ent = await db.getEntitlement(orgId);
  if (!ent?.subscriptionId || !ent.isPaid) return null;
  const u = usage ?? (await mailboxUsage(db, orgId));
  if (u.mode !== "metered") return null;
  const sub = await stripe.subscriptions.retrieve(ent.subscriptionId);
  if (sub.metadata?.app !== db.app) return null;
  const line = sub.items.data.find((i) => i.price.lookup_key === product.extraMailbox.lookupKey);
  if (u.extra === 0) {
    if (line) await stripe.subscriptionItems.del(line.id, { proration_behavior: "create_prorations" });
    return 0;
  }
  if (line) {
    if (line.quantity !== u.extra) await stripe.subscriptionItems.update(line.id, { quantity: u.extra, proration_behavior: "create_prorations" });
    return u.extra;
  }
  const price = (await stripe.prices.list({ lookup_keys: [product.extraMailbox.lookupKey], active: true, limit: 1 })).data.find((p) => p.metadata?.app === db.app);
  if (!price) return null;
  await stripe.subscriptionItems.create({ subscription: sub.id, price: price.id, quantity: u.extra, proration_behavior: "create_prorations" });
  return u.extra;
}
