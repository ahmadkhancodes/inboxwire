import { METERS_SHOWN } from "@/components/app/labels";
import { PageHeader } from "@/components/app/page-header";
import { planById } from "@/config/product";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { effectivePlan } from "@/lib/billing/entitlement";
import { mailboxUsage } from "@/lib/billing/mailboxes";
import { currentUsage } from "@/lib/billing/usage";
import { orgLicences } from "@/lib/licences";
import { getDb } from "@/lib/db";
import { BillingClient } from "./billing-client";

export const metadata = { title: "Billing" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BillingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const ent = await db.getEntitlement(ctx.org.id);
  const plan = effectivePlan(ent);
  const usage = (await currentUsage(db, ctx.org.id, METERS_SHOWN)).filter((u) => u.meter !== "mailboxes");
  const mailboxes = await mailboxUsage(db, ctx.org.id);
  const licences = await orgLicences(db, ctx.org.id);
  const want = one(sp.plan);
  const wanted = want ? planById(want) : undefined;
  return (
    <>
      <PageHeader field="Account / billing" title="Billing" description={`Plan, usage and invoices for ${ctx.org.name}.`} />
      <BillingClient
        canManage={can(ctx.role, "billing", "manage")}
        planId={plan.id}
        status={ent?.status ?? "none"}
        isPaid={!!ent?.isPaid}
        interval={ent?.interval ?? null}
        renewsAt={ent?.expiresAt ?? null}
        cancelAtPeriodEnd={!!ent?.cancelAtPeriodEnd}
        usage={usage}
        mailboxes={{ used: mailboxes.used, included: mailboxes.included, extra: mailboxes.extra, mode: mailboxes.mode, extraPriceCents: mailboxes.extraPriceCents, estimatedExtraCents: mailboxes.estimatedExtraCents, level: mailboxes.state.level }}
        licences={licences}
        preselect={wanted && wanted.id !== "free" ? { plan: wanted.id, interval: one(sp.interval) === "month" ? "month" : "year" } : null}
        returnedSession={one(sp.session_id) ?? null}
      />
    </>
  );
}
