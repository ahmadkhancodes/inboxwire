import Link from "next/link";
import { Meter } from "@/components/app/meter";
import { METERS_SHOWN } from "@/components/app/labels";
import { PageHeader } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/states";
import { requireOrg } from "@/lib/auth/session";
import { effectivePlan } from "@/lib/billing/entitlement";
import { currentUsage } from "@/lib/billing/usage";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { onboardingFacts, onboardingSteps } from "@/lib/onboarding";
import { headers } from "next/headers";

/** Number of API keys of the org; 0 when the list cannot be read (the checklist then just shows the step as open). */
async function keyCount(orgId: string): Promise<number> {
  try {
    const auth = await getAuth();
    const r = (await auth.api.listApiKeys({ headers: await headers(), query: { organizationId: orgId } })) as unknown;
    return Array.isArray(r) ? r.length : ((r as { apiKeys?: unknown[] } | null)?.apiKeys?.length ?? 0);
  } catch { return 0; }
}

export const metadata = { title: "Overview" };


export default async function OverviewPage() {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const ent = await db.getEntitlement(ctx.org.id);
  const plan = effectivePlan(ent);
  const usage = await currentUsage(db, ctx.org.id, METERS_SHOWN);
  const ob = onboardingSteps(await onboardingFacts(db, ctx.org.id, await keyCount(ctx.org.id)));
  return (
    <>
      <PageHeader field={`${ctx.org.name} / overview`} title={ctx.org.name} description={`Signed in as ${ctx.user.email}.`} />
      <dl className="m-0 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2 bg-surface p-4">
          <dt className="flex items-center justify-between gap-2 font-mono caption-5 text-text-muted">
            <span id="plan-h">Plan</span>
            {ent?.status === "past_due" ? <Badge tone="warning">Payment failed</Badge> : ent?.cancelAtPeriodEnd ? <Badge tone="warning">Ends soon</Badge> : <Badge tone="success">Active</Badge>}
          </dt>
          <dd className="m-0 flex flex-col gap-1">
            <span className="heading-5 text-text">{plan.name}</span>
            <span className="body-6 text-text-subtle">{plan.tagline}</span>
            <Link href="/app/billing" className="mt-1 inline-flex min-h-11 w-fit items-center body-4 text-text underline decoration-border-strong decoration-2 underline-offset-4 hover:decoration-text focus-visible:focus-ring">
              {plan.id === "free" ? "See plans" : "Manage plan"}
            </Link>
          </dd>
        </div>
        {usage.map((u) => (
          <div key={u.meter} className="flex flex-col justify-end bg-surface p-4">
            <Meter state={u} />
          </div>
        ))}
      </dl>
      <section aria-labelledby="steps-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="steps-h" className="heading-6 text-text">Get to your first webhook</h2>
          <p className="body-6 text-text-subtle"><span data-testid="onboarding-progress" className="tabular-nums">{ob.doneCount} of {ob.total} done.</span> {ob.next ? "Four steps, about ten minutes. Each opens the screen where you do it." : "All set. Your mailboxes are wired to your webhook."}</p>
        </div>
        <ol className="m-0 border-y border-border p-0">
          {ob.steps.map((st, n) => (
            <li key={st.href} className="grid items-center gap-x-6 gap-y-2 border-t border-border py-4 first:border-t-0 sm:grid-cols-12">
              <span aria-hidden className="font-mono caption-5 tabular-nums text-text-muted sm:col-span-1">{String(n + 1).padStart(2, "0")}</span>
              <div className="flex min-w-0 flex-col gap-1 sm:col-span-8">
                <p className="flex flex-wrap items-center gap-2 title-3 text-text"><span className="sr-only">{n + 1}. </span>{st.title}{st.done ? <Badge tone="success">Done</Badge> : null}</p>
                <p className="body-6 text-text-subtle">{st.body}</p>
              </div>
              <div className="sm:col-span-3 sm:justify-self-end">
                <Link href={st.href} className={buttonClass(st.id === ob.next ? "primary" : "secondary")}>{st.cta}</Link>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
