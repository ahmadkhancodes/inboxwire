import type { Plan } from "@/config/product";
import type { MailboxUsage } from "@/lib/billing/mailboxes";
import type { z } from "zod";
import type { UsageSchema } from "./schemas";

export const usageView = (plan: Plan, m: MailboxUsage, environments: number): z.infer<typeof UsageSchema> => ({
  plan: m.plan,
  mailboxes: { used: m.used, included: m.included, extra: m.extra, mode: m.mode, extraPriceCents: m.extraPriceCents, estimatedExtraCents: m.estimatedExtraCents, level: m.state.level, canAdd: m.canAdd },
  environments: { used: environments, limit: plan.limits.environments },
});
