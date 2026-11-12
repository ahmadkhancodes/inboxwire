import Link from "next/link";
import { Notice } from "@/components/ui/states";
import type { Entitlement } from "@/lib/db/types";
import type { UsageState } from "@/lib/billing/usage";
import { product } from "@/config/product";
import { effectivePlan } from "@/lib/billing/entitlement";
import { METER_LABELS, fmt } from "./labels";

const SEVERITY = { ok: 0, near: 1, at: 2, over: 3 } as const;

/** One wording for every resource (mailboxes, environments, seats): tone, title and body per level. Exact comparisons live in usageState. */
export function limitNotice(u: UsageState, opts: { metered?: boolean; extraCents?: number } = {}) {
  const label = METER_LABELS[u.meter];
  const period = label.period ? ` ${label.period}` : "";
  const what = `${fmt(u.limit)} ${u.limit === 1 ? label.singular : label.plural}${period}`;
  const blocked =
    u.meter === "mailboxes"
      ? opts.metered
        ? ` Connected mailboxes keep working; each extra one is billed at $${((opts.extraCents ?? 0) / 100).toFixed(2)} a month.`
        : " Connected mailboxes keep working; new connections are refused until you upgrade or remove one."
      : ` Adding another ${label.singular} is blocked until you upgrade or remove one.`;
  if (u.level === "over") return { tone: "danger" as const, title: "You are over your limit", body: `You have used ${fmt(u.used)} of ${what}.${blocked}` };
  if (u.level === "at") return { tone: "info" as const, title: undefined, body: `You are using all ${what}. Upgrade when you need more.` };
  return { tone: "warning" as const, title: "You are close to your limit", body: `You have used ${fmt(u.used)} of ${what}.` };
}

/** Shown in the app layout when a meter is near/at/over its limit, or a payment failed. Only strictly over is red. */
export function UsageBanner({ usage, entitlement }: { usage: UsageState[]; entitlement: Entitlement | null }) {
  const worst = [...usage].filter((u) => u.level !== "ok").sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level] || b.ratio - a.ratio)[0];
  const pastDue = entitlement?.status === "past_due";
  const metered = effectivePlan(entitlement).id === product.extraMailbox.plan;
  if (!worst && !pastDue) return null;
  const n = worst ? limitNotice(worst, { metered, extraCents: product.extraMailbox.usd }) : null;
  const link = (label: string) => (
    <Link href="/app/billing" className="button-sm inline-flex min-h-11 items-center rounded-sm border border-border-strong bg-surface px-3 py-2 text-text transition-colors duration-300 hover:border-text focus-visible:focus-ring">
      {label}
    </Link>
  );
  return (
    <div className="flex flex-col gap-2">
      {pastDue ? (
        <Notice tone="warning" title="Your last payment failed" action={link("Update payment")}>
          Your plan stays active for {product.graceDays} days while we retry. Update your payment method to avoid falling back to Free.
        </Notice>
      ) : null}
      {n ? (
        <Notice tone={n.tone} title={n.title} action={link(worst!.level === "at" ? "See plans" : "Upgrade")}>
          {n.body}
        </Notice>
      ) : null}
    </div>
  );
}
