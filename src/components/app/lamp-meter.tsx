import { cn } from "@/components/ui/cn";
import type { MailboxUsage } from "@/lib/billing/mailboxes";
import type { UsageLevel } from "@/lib/billing/usage";
import { fmt } from "./labels";

/** Mailboxes against the plan as a row of ten lamps (one lamp = 10% of the allowance). Level is also written out and shown by shape, never by colour alone. */
export function LampMeter({ usage }: { usage: Pick<MailboxUsage, "used" | "included" | "extra" | "mode" | "extraPriceCents" | "estimatedExtraCents"> & { level: UsageLevel } }) {
  const unlimited = usage.mode === "unlimited";
  const ratio = unlimited || usage.included <= 0 ? 0 : Math.min(1, usage.used / usage.included);
  const lit = unlimited ? (usage.used > 0 ? 1 : 0) : Math.ceil(ratio * 10 - 1e-9);
  const word = unlimited ? "no limit" : usage.level === "over" ? "over the allowance" : usage.level === "at" ? "at the allowance" : usage.level === "near" ? "near the allowance" : "within the allowance";
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="title-4 text-text">Mailboxes</p>
        <p className="caption-2 text-text-subtle tabular-nums">{unlimited ? `${fmt(usage.used)} connected` : `${fmt(usage.used)} of ${fmt(usage.included)}`}</p>
      </div>
      <div role="img" aria-label={`${lit} of 10 lamps lit: ${usage.used} mailboxes, ${word}`} className="flex gap-2">
        {Array.from({ length: 10 }, (_, i) => {
          const on = i < lit;
          const hot = usage.level === "over" && !unlimited;
          return (
            <span
              key={i}
              aria-hidden
              className={cn(
                "size-4 border transition-colors duration-300",
                hot ? "rounded-none" : "rounded-full",
                on ? (hot ? "border-danger bg-danger" : usage.level === "near" ? "border-warning bg-warning" : "border-action bg-action") : "border-border-strong bg-transparent",
              )}
            />
          );
        })}
      </div>
      <p className="caption-2 text-text-subtle">
        {unlimited ? "Self-host has no mailbox limit." : `${word.charAt(0).toUpperCase()}${word.slice(1)}.`}
        {usage.mode === "metered" && usage.extra > 0 ? ` ${usage.extra} extra at ${money(usage.extraPriceCents)} each: ${money(usage.estimatedExtraCents)} a month.` : ""}
        {usage.mode === "metered" && usage.extra === 0 ? ` Each mailbox over ${usage.included} costs ${money(usage.extraPriceCents)} a month.` : ""}
        {usage.mode === "hard_cap" && (usage.level === "over" || usage.level === "at") ? " New connections are refused until you upgrade or remove a mailbox." : ""}
      </p>
    </div>
  );
}
