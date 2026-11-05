import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { PageHeader, Panel } from "@/components/app/page-header";
import { Notice } from "@/components/ui/states";
import { StatusLamp } from "@/components/ui/status-lamp";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { buildTimeline, explainState, lampLabel, lampOf } from "@/lib/live/lines";

export const metadata = { title: "Line" };
export const dynamic = "force-dynamic";

export default async function LineDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const a = await db.getAccount((await params).id);
  const env = a ? await db.getEnvironment(a.envId) : null;
  if (!a || !env || env.orgId !== ctx.org.id) notFound();
  const [deliveries, outbox] = await Promise.all([db.listDeliveries(ctx.org.id, { limit: 300 }), db.listOutbox([env.id], 100)]);
  const timeline = buildTimeline(a, deliveries, outbox);
  const why = explainState(a);
  return (
    <>
      <AutoRefresh seconds={5} />
      <PageHeader
        title={a.email}
        description={<><Link href="/app/lines" className="underline underline-offset-4 focus-visible:focus-ring">All lines</Link> · {a.provider} via {a.backend} · {env.name} · {a.mode === "push" ? "push" : "polling mode"}</>}
        actions={<StatusLamp state={lampOf(a)} label={lampLabel(a)} />}
      />
      <div className="flex flex-col gap-6">
        {a.state !== "connected" && a.state !== "syncing" ? (
          <Notice tone={a.state === "throttled" ? "warning" : "danger"} title={why.title}>
            <p>{why.cause}</p>
            <p className="mt-1">{why.fix}</p>
          </Notice>
        ) : null}
        <Panel title="Timeline" description="Newest first: connection, push renewals, webhook events and sends for this line.">
          <ol className="m-0 flex list-none flex-col p-0">
            {timeline.map((t, i) => (
              <li key={`${t.at}-${i}`} className="grid grid-cols-[8.5rem_1fr] gap-4 border-b border-dotted border-border py-2 last:border-b-0">
                <time dateTime={t.at} className="font-mono caption-5 text-text-subtle">{t.at.slice(0, 10)} {t.at.slice(11, 19)}</time>
                <p className="body-6 text-text">{t.title}{t.detail ? <span className="text-text-subtle"> · {t.detail}</span> : null}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
