import { orgOwnerEmails } from "@/lib/auth/owners";
import { planById, product, type PlanId } from "@/config/product";
import type { Db } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { sendMailSafe, type MailTransport } from "@/lib/mail";
import { noticeEmail } from "@/lib/mail/templates";
import { log } from "@/lib/logger";

/** At most one limit e-mail per organisation per UTC day, however many end users hit the cap. */
export const LIMIT_NOTICE_WINDOW_MS = 24 * 3600 * 1000;

/** The plan to suggest when a hard-capped plan is full: the next hosted plan that has more mailboxes. */
export function upgradeTarget(planId: PlanId) {
  const cur = planById(planId);
  const cloud = product.plans.filter((p) => p.prices.length > 0 && p.id !== "selfhost");
  return cloud.find((p) => p.limits.mailboxes > (cur?.limits.mailboxes ?? 0)) ?? null;
}

export function mailboxLimitEmail(opts: { planName: string; limit: number; target: { id: string; name: string; mailboxes: number } | null; base: string }) {
  const metered = opts.target?.id === product.extraMailbox.plan;
  const next = opts.target
    ? ` ${opts.target.name} includes ${opts.target.mailboxes} mailboxes${metered ? ` and bills extra ones at $${(product.extraMailbox.usd / 100).toFixed(2)} a month each instead of refusing them` : ""}.`
    : "";
  return noticeEmail({
    title: `A mailbox connection was refused: ${opts.planName} allows ${opts.limit}`,
    body: `One of your users finished a connect link, but your organisation already uses all ${opts.limit} mailboxes on ${opts.planName}, so we did not add it and showed them a message. Upgrade, or delete a line you no longer need, and send them a new connect link.${next}`,
    actionUrl: `${opts.base}/app/billing${opts.target ? `?plan=${opts.target.id}` : ""}`,
    actionLabel: opts.target ? `See ${opts.target.name}` : "Open billing",
  });
}

/** Best effort, never throws: e-mails the owners that a connect was refused for the mailbox limit (throttled per org). */
export async function notifyMailboxLimit(
  db: Db,
  orgId: string,
  planId: PlanId,
  limit: number,
  deps: { owners?: (orgId: string) => Promise<string[]>; transport?: MailTransport; now?: number } = {},
) {
  try {
    // One bucket per UTC day: a sliding window would keep extending itself while refusals keep coming and never re-notify.
    const now = deps.now ?? Date.now();
    const day = Math.floor(now / LIMIT_NOTICE_WINDOW_MS);
    const hits = await db.hitRateLimit(`limit-notice:mailboxes:${orgId}:${day}`, LIMIT_NOTICE_WINDOW_MS, now);
    if (hits > 1) return 0;
    const plan = planById(planId);
    const t = upgradeTarget(planId);
    const m = mailboxLimitEmail({ planName: plan?.name ?? planId, limit, target: t ? { id: t.id, name: t.name, mailboxes: t.limits.mailboxes } : null, base: appUrl() });
    let sent = 0;
    for (const to of await (deps.owners ?? orgOwnerEmails)(orgId)) if ((await sendMailSafe({ to, ...m, category: "transactional" }, deps.transport)).ok) sent++;
    return sent;
  } catch (e) {
    log.warn("limit_notice_failed", { message: (e as Error).message });
    return 0;
  }
}
