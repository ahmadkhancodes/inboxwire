"use client";
import Link from "next/link";
import { api, formatDate, useAsync } from "@/components/app/api";
import { DataTable, Td } from "@/components/app/data-table";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

interface Item { id: string; accountId: string; env: string | null; status: "queued" | "sending" | "sent" | "failed"; attempts: number; sendAt: string; error: string | null; createdAt: string }
const TONE = { queued: "info", sending: "warning", sent: "success", failed: "danger" } as const;
const MARK = { queued: "○", sending: "◐", sent: "✓", failed: "■" } as const;

export function OutboxClient() {
  const list = useAsync(async () => {
    const r = await api<{ items: Item[] }>("/api/app/outbox");
    if (!r.ok) throw new Error(r.message);
    return r.data.items;
  });
  if (list.loading && !list.data) return <div aria-busy="true" aria-label="Loading outbox" className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
  if (list.error && !list.data) return <ErrorState title="Could not load the outbox" body={list.error} action={<Button variant="secondary" onClick={list.reload}>Try again</Button>} />;
  const rows = list.data ?? [];
  if (rows.length === 0) return <EmptyState title="Nothing queued" example={<><span className="block truncate">obx_7Hq2… · sent · 1 attempt · production</span><span className="block truncate">obx_9Ka4… · retrying · 2 attempts · 429 from Graph</span></>} body="Sends appear here the moment your API call returns 202, with the attempts and the provider's error if one failed." action={<Link href="/docs/api" className={buttonClass("secondary", "md")}>Read the send docs</Link>} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={list.reload}>Refresh</Button></div>
      <DataTable caption="Queued and finished sends" columns={[{ key: "t", label: "Queued" }, { key: "id", label: "Outbox id" }, { key: "st", label: "Status" }, { key: "a", label: "Attempts", align: "right" }, { key: "env", label: "Environment" }, { key: "err", label: "Error" }]}>
        {rows.map((o) => (
          <tr key={o.id}>
            <Td muted className="font-mono caption-5">{formatDate(o.createdAt, true)}</Td>
            <Td className="font-mono caption-5"><Link href={`/app/lines/${o.accountId}`} className="underline underline-offset-4 focus-visible:focus-ring">{o.id.slice(-12)}</Link></Td>
            <Td><Badge tone={TONE[o.status]}>{MARK[o.status]} {o.status}</Badge></Td>
            <Td align="right" muted>{o.attempts}</Td>
            <Td muted>{o.env ?? "none"}</Td>
            <Td muted className="max-w-xs truncate">{o.error ?? ""}</Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
