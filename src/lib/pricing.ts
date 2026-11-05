import { emailengine, nylas } from "@/config/competitors";
import { plans, product, type Plan } from "@/config/product";

/** All amounts are USD cents per month. Prices come from product.ts and competitors.ts only. */

const plan = (id: Plan["id"]): Plan => plans.find((p) => p.id === id)!;
const monthly = (p: Plan) => p.prices.find((x) => x.interval === "month")!.usd;

export interface OurBill {
  cents: number;
  /** Human label of what is billed, e.g. "Cloud Growth + 20 extra". */
  label: string;
}

/** Our hosted Cloud bill for n mailboxes: the smallest plan that fits, extras only on the plan that sells them. */
export function cloudBill(n: number): OurBill {
  const free = plan("free");
  const starter = plan("starter");
  const growth = plan("growth");
  if (n <= free.limits.mailboxes) return { cents: 0, label: free.name };
  if (n <= starter.limits.mailboxes) return { cents: monthly(starter), label: starter.name };
  const extra = Math.max(0, n - growth.limits.mailboxes);
  const label = extra ? `${growth.name} + ${extra} extra` : growth.name;
  return { cents: monthly(growth) + extra * product.extraMailbox.usd, label };
}

/** Self-host licence billed yearly, per month. Unlimited mailboxes. */
export function selfHostMonthly(): number {
  const y = plan("selfhost").prices.find((x) => x.interval === "year")!.usd;
  return Math.round(y / 12);
}

export function emailengineMonthly(): number {
  return Math.round(emailengine.yearlyUsd / 12);
}

/** Nylas published monthly rates; Pro plus a per-account fee above its allowance. */
export function nylasBill(n: number): OurBill {
  const tier = nylas.tiers.find((t) => n <= t.maxAccounts);
  if (tier) return { cents: tier.monthlyUsd, label: tier.name };
  const pro = nylas.tiers[nylas.tiers.length - 1]!;
  const extra = n - pro.maxAccounts;
  return { cents: pro.monthlyUsd + extra * nylas.proExtraMonthlyUsd, label: `Pro + ${extra} extra` };
}
