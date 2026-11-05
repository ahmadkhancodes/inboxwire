"use client";
import Link from "next/link";
import { LiveStatus } from "@/components/app/live-status";
import { useLive } from "@/components/app/use-live";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import type { LiveSnapshot } from "@/lib/live/lines";

export function TickerClient({ initial }: { initial: LiveSnapshot }) {
  const { snap, mode, error } = useLive(initial);
  if (!snap) return <div aria-busy="true" aria-label="Loading ticker"><Skeleton className="h-40 w-full" /></div>;
  if (error && snap.events.length === 0) return <ErrorState title="Could not load events" body={error} />;
  const email = new Map(snap.lines.map((l) => [l.id, l.email]));
  return (
    <div className="flex flex-col gap-3">
      <LiveStatus mode={mode} />
      {snap.events.length === 0 ? (
        <EmptyState title="Nothing on the tape yet" body="Events print here when a mailbox changes and you have a webhook endpoint subscribed to it." action={<Link href="/app/settings/webhooks" className={buttonClass("secondary", "md")}>Add a webhook endpoint</Link>} />
      ) : (
        <ol aria-label="Webhook ticker" aria-live="polite" className="m-0 list-none overflow-hidden rounded-lg border border-dashed border-border-strong bg-tape p-0 font-mono caption-5">
          {snap.events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-4 border-b border-dotted border-border px-4 py-2 last:border-b-0 motion-safe:animate-[tape-in_160ms_ease-out]">
              <time dateTime={e.at} className="text-text-subtle">{e.at.slice(11, 19)}</time>
              <span className="text-text">{e.type}</span>
              <span className="text-text-subtle">{e.accountId ? (email.get(e.accountId) ?? e.accountId) : "organization"}</span>
              <span className="text-text-subtle">{e.id.slice(-8)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
