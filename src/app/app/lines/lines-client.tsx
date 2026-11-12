"use client";
import Link from "next/link";
import { DataTable, Td } from "@/components/app/data-table";
import { LiveStatus } from "@/components/app/live-status";
import { useLive } from "@/components/app/use-live";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { StatusLamp } from "@/components/ui/status-lamp";
import type { LiveSnapshot } from "@/lib/live/lines";

const PROVIDER = { google: "Google", microsoft: "Microsoft", imap: "IMAP" } as const;

export function LinesClient({ initial }: { initial: LiveSnapshot }) {
  const { snap, mode, error } = useLive(initial);
  if (!snap) return <div aria-busy="true" aria-label="Loading lines" className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
  if (error && snap.lines.length === 0) return <ErrorState title="Could not load your lines" body={error} />;
  if (snap.lines.length === 0) {
    return (
      <EmptyState
        title="No lines yet" example={<><span className="block truncate">ops@northwind-crm.example · Google · ● live</span><span className="block truncate">intake@kestrel-ats.example · IMAP · ◐ syncing</span></>}
        body={<>A line appears when a user finishes your connect link. Create one with <code className="font-mono caption-5">POST /v1/connect-links</code>, send the user to the URL, and the lamp lights here.</>}
        action={<Link href="/docs/api" className={buttonClass("secondary", "md")}>Read the connect docs</Link>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiveStatus mode={mode} />
        <p className="caption-2 text-text-subtle tabular-nums">{snap.lines.filter((l) => l.lamp === "live").length} of {snap.lines.length} live</p>
      </div>
      {error ? <ErrorState title="Updates paused" body={`${error} We keep trying.`} /> : null}
      <ul aria-label="Connected mailboxes" className="m-0 list-none border-y border-border p-0 md:hidden">
        {snap.lines.map((l) => (
          <li key={l.id} className="border-t border-border first:border-t-0">
            <Link href={`/app/lines/${l.id}`} className="flex min-h-11 flex-col gap-1 py-3 transition-colors duration-200 hover:bg-surface-sunken focus-visible:focus-ring">
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-mono caption-5 text-text">{l.email}</span>
                <StatusLamp state={l.lamp} label={l.lampLabel} className="shrink-0" />
              </span>
              <span className="font-mono caption-5 text-text-muted">{PROVIDER[l.provider]} · {l.mode} · {l.lastEvent ? `${l.lastEvent.type} ${l.lastEvent.at.slice(11, 19)} UTC` : "no events yet"}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
      <DataTable
        caption="Connected mailboxes"
        columns={[{ key: "line", label: "Line" }, { key: "provider", label: "Provider" }, { key: "state", label: "State" }, { key: "mode", label: "Mode" }, { key: "last", label: "Last event" }, { key: "env", label: "Environment" }]}
      >
        {snap.lines.map((l) => (
          <tr key={l.id}>
            <Td className="font-mono caption-5"><Link href={`/app/lines/${l.id}`} className="underline underline-offset-4 hover:text-text focus-visible:focus-ring">{l.email}</Link></Td>
            <Td>{PROVIDER[l.provider]}</Td>
            <Td>
              <StatusLamp state={l.lamp} label={l.lampLabel} />
              {l.lamp !== "live" ? (
                <details className="mt-1">
                  <summary className="caption-2 cursor-pointer text-text-subtle focus-visible:focus-ring">Why, and what to do</summary>
                  <p className="caption-2 mt-1 max-w-sm text-text">{l.explanation.cause}</p>
                  <p className="caption-2 mt-1 max-w-sm text-text-subtle">{l.explanation.fix}</p>
                </details>
              ) : null}
            </Td>
            <Td muted className="font-mono caption-5">{l.mode}</Td>
            <Td muted className="font-mono caption-5">{l.lastEvent ? `${l.lastEvent.type} ${l.lastEvent.at.slice(11, 19)} UTC` : "none yet"}</Td>
            <Td muted>{l.env}</Td>
          </tr>
        ))}
      </DataTable>
      </div>
    </div>
  );
}
