import Link from "next/link";
import { Meter } from "@/components/app/meter";
import { METERS_SHOWN } from "@/components/app/labels";
import { PageHeader, Panel } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/states";
import { requireOrg } from "@/lib/auth/session";
import { effectivePlan } from "@/lib/billing/entitlement";
import { currentUsage } from "@/lib/billing/usage";
import { getDb } from "@/lib/db";

export const metadata = { title: "Overview" };

const STEPS = [
  { title: "Create an API key", body: "Server-side key for calls to /v1. It is shown once, so copy it into your environment.", href: "/app/keys", cta: "Create a key" },
  { title: "Add a webhook endpoint", body: "Where we send signed events such as messageNew. Send a test to check your signature code.", href: "/app/settings/webhooks", cta: "Add an endpoint" },
  { title: "Connect a mailbox", body: "Create a connect link from the API, or look at your lines once someone has connected.", href: "/app/lines", cta: "Open lines" },
  { title: "Watch the first event arrive", body: "New mail shows up on the ticker and fires your webhook within seconds.", href: "/app/ticker", cta: "Open the ticker" },
] as const;

export default async function OverviewPage() {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const ent = await db.getEntitlement(ctx.org.id);
  const plan = effectivePlan(ent);
  const usage = await currentUsage(db, ctx.org.id, METERS_SHOWN);
  return (
    <>
      <PageHeader title={ctx.org.name} description={`Signed in as ${ctx.user.email}.`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="plan-h" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 id="plan-h" className="title-4 text-text-subtle">Current plan</h2>
            {ent?.status === "past_due" ? <Badge tone="warning">Payment failed</Badge> : ent?.cancelAtPeriodEnd ? <Badge tone="warning">Ends soon</Badge> : <Badge tone="success">Active</Badge>}
          </div>
          <p className="heading-4 text-text">{plan.name}</p>
          <p className="body-6 text-text-subtle">{plan.tagline}</p>
          <Link href="/app/billing" className={buttonClass("secondary", "md", "self-start")}>
            {plan.id === "free" ? "See plans" : "Manage plan"}
          </Link>
        </section>
        <section aria-labelledby="usage-h" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 lg:col-span-2">
          <h2 id="usage-h" className="title-4 text-text-subtle">Usage</h2>
          <div className="flex flex-col gap-6">
            {usage.map((u) => <Meter key={u.meter} state={u} />)}
          </div>
        </section>
      </div>
      <Panel title="Get to your first webhook" description="Four steps, about ten minutes. Each opens the screen where you do it.">
        <ol className="flex flex-col gap-3">
          {STEPS.map((st, n) => (
            <li key={st.href} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="title-4 text-text">{n + 1}. {st.title}</p>
                <p className="body-6 text-text-subtle">{st.body}</p>
              </div>
              <Link href={st.href} className={buttonClass(n === 0 ? "primary" : "secondary")}>{st.cta}</Link>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}
