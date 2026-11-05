import { effectivePlan } from "@/lib/billing/entitlement";
import { mailboxUsageFor, countMailboxes } from "@/lib/billing/mailboxes";
import { json } from "@/lib/http";
import { v1 } from "@/lib/v1/handler";
import { usageView } from "@/lib/v1/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /v1/usage`: active mailboxes against the plan (the number the dashboard meter and the Stripe quantity use). */
export const GET = v1("read", async ({ db, orgId }) => {
  const plan = effectivePlan(await db.getEntitlement(orgId));
  return json(usageView(plan, mailboxUsageFor(plan, await countMailboxes(db, orgId)), (await db.listEnvironments(orgId)).length));
});
