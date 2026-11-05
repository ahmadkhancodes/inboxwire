import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { StatusLamp } from "@/components/ui/status-lamp";
import { Notice } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { product } from "@/config/product";
import { loadStatus, STATUS_DAYS, type DayState, type TargetSummary } from "@/lib/status";
import { log } from "@/lib/logger";

const title = "Status";
const description = `Live and 90 day uptime for ${product.fullName}: REST API and database, probed every 5 minutes.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/status" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/status" },
};

/** Static page, rebuilt at most once a minute from the uptime_checks collection. */
export const revalidate = 60;

const dayClass: Record<DayState, string> = {
  up: "bg-success",
  degraded: "bg-warning",
  down: "bg-danger",
  none: "bg-border",
};
const dayLabel: Record<DayState, string> = { up: "no failed checks", degraded: "some failed checks", down: "mostly failed checks", none: "no data" };

async function safeLoad(): Promise<TargetSummary[] | null> {
  try {
    return await loadStatus();
  } catch (e) {
    log.error("status_load_failed", { route: "status", message: (e as Error).message });
    return null;
  }
}

const pct = (v: number | null) => (v === null ? "no data yet" : `${v.toFixed(1)}%`);

export default async function StatusPage() {
  const targets = await safeLoad();
  const allUp = targets?.every((t) => t.current === "up");
  const anyDown = targets?.some((t) => t.current === "down");
  const lastChecked = targets?.map((t) => t.lastCheckedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <Section labelledBy="status-title">
      <div className="flex max-w-2xl flex-col items-start gap-4">
        <h1 id="status-title" className="heading-3 md:heading-1 text-text">Status</h1>
        <p className="body-3 text-text-subtle md:title-1">
          {targets === null
            ? "Status data is unavailable right now."
            : anyDown
              ? "We are seeing failed checks."
              : allUp
                ? "Every line is live."
                : "Waiting for the first probe results."}
        </p>
        <p className="body-6 text-text-subtle">
          Probed every 5 minutes from our own cron.
          {lastChecked ? <> Last check <time dateTime={lastChecked.toISOString()}>{lastChecked.toISOString().slice(0, 16).replace("T", " ")} UTC</time>.</> : null}
        </p>
      </div>

      <div className="mt-12 md:mt-16">
        {targets === null ? (
          <Notice tone="warning" title="Could not load uptime history">This page reads from our database. Try again in a minute.</Notice>
        ) : (
          <ul className="flex flex-col gap-4">
            {targets.map((t) => (
              <li key={t.id} className="rounded-lg border border-border bg-surface p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="heading-6 text-text">{t.label}</h2>
                    <p className="caption-2 text-text-subtle">{t.detail}</p>
                  </div>
                  <StatusLamp
                    state={t.current === "up" ? "live" : t.current === "down" ? "error" : "idle"}
                    label={t.current === "up" ? "Operational" : t.current === "down" ? "Failing" : "No data yet"}
                  />
                </div>
                <div role="img" aria-label={`${t.label}, last ${STATUS_DAYS} days, oldest to newest`} className="mt-6 flex h-10 items-stretch gap-px">
                  {t.days.map((d) => (
                    <span key={d.date} title={`${d.date}: ${dayLabel[d.state]}${d.checks ? ` (${d.failed} of ${d.checks} failed)` : ""}`} className={cn("min-w-0 flex-1 rounded-sm", dayClass[d.state])} />
                  ))}
                </div>
                <div className="caption-2 mt-2 flex justify-between text-text-subtle">
                  <span>{STATUS_DAYS} days ago</span>
                  <span>Today</span>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6">
                  <div>
                    <dt className="caption-2 text-text-subtle">{STATUS_DAYS} day uptime</dt>
                    <dd className="title-3 tabular-nums text-text">{pct(t.uptimePct)}</dd>
                  </div>
                  <div>
                    <dt className="caption-2 text-text-subtle">Median, last 24 h</dt>
                    <dd className="title-3 tabular-nums text-text">{t.medianMs === null ? "no data yet" : `${t.medianMs} ms`}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
        <ul className="caption-2 mt-6 flex flex-wrap gap-x-6 gap-y-2 text-text-subtle">
          {(["up", "degraded", "down", "none"] as DayState[]).map((s) => (
            <li key={s} className="flex items-center gap-2"><span aria-hidden className={cn("size-3 rounded-sm", dayClass[s])} />{dayLabel[s]}</li>
          ))}
        </ul>
        <p className="body-6 mt-8 max-w-2xl text-text-subtle">
          Incidents and questions: <a className="underline underline-offset-4 hover:text-text focus-visible:focus-ring" href={`mailto:${product.supportEmail}`}>{product.supportEmail}</a>.
        </p>
      </div>
    </Section>
  );
}
