"use client";
import Link from "next/link";
import { useState } from "react";
import { api, formatDate, useAsync } from "@/components/app/api";
import { DataTable, Td } from "@/components/app/data-table";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from "@/components/ui/states";

interface Delivery { id: string; eventId?: string; event: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; lastLatencyMs?: number | null; createdAt: string; nextAttemptAt: string | null; replayOf?: string | null; replayedAt?: string | null }
const TONE: Record<string, "info" | "success" | "warning" | "danger"> = { succeeded: "success", failed: "danger", retrying: "warning", pending: "info" };
const MARK: Record<string, string> = { succeeded: "✓", failed: "■", retrying: "◐", pending: "○" };

export function DeliveriesClient({ canReplay }: { canReplay: boolean }) {
  const list = useAsync(async () => {
    const r = await api<{ deliveries: Delivery[] }>("/api/webhooks/deliveries");
    if (!r.ok) throw new Error(r.message);
    return r.data.deliveries;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function replay(d: Delivery) {
    setBusy(d.id);
    setNotice(null);
    const r = await api<{ status: string; statusCode: number | null }>(`/api/app/deliveries/${d.id}/replay`, { method: "POST", body: {} });
    setBusy(null);
    setNotice(r.ok
      ? { ok: r.data.status === "succeeded", text: r.data.status === "succeeded" ? `Replayed ${d.event}: your endpoint answered ${r.data.statusCode}.` : `Replayed ${d.event}, but the endpoint did not accept it yet (${r.data.statusCode ?? "no answer"}). It will retry.` }
      : { ok: false, text: r.code === "endpoint_disabled" ? "The endpoint is disabled. Turn it on in Webhooks, then replay." : r.message });
    list.reload();
  }

  if (list.loading && !list.data) return <div aria-busy="true" aria-label="Loading deliveries" className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
  if (list.error && !list.data) return <ErrorState title="Could not load deliveries" body={list.error} action={<Button variant="secondary" onClick={list.reload}>Try again</Button>} />;
  const rows = list.data ?? [];
  if (rows.length === 0) return <EmptyState title="No deliveries yet" body="Deliveries are logged here once an endpoint is subscribed and an event happens." action={<Link href="/app/settings/webhooks" className={buttonClass("secondary", "md")}>Add a webhook endpoint</Link>} />;
  const failed = rows.filter((d) => d.status === "failed" && !d.replayedAt).length;
  return (
    <div className="flex flex-col gap-4">
      {notice ? <Notice tone={notice.ok ? "success" : "warning"} title={notice.ok ? "Delivered" : "Not delivered"}>{notice.text}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="caption-2 text-text-subtle tabular-nums">{rows.length} most recent, {failed} failed and not replayed</p>
        <Button variant="secondary" size="sm" onClick={list.reload}>Refresh</Button>
      </div>
      <DataTable caption="Webhook deliveries" columns={[{ key: "t", label: "Queued" }, { key: "e", label: "Event" }, { key: "s", label: "Status" }, { key: "c", label: "Code", align: "right" }, { key: "ms", label: "Latency", align: "right" }, { key: "a", label: "Attempts", align: "right" }, { key: "r", label: "" }]}>
        {rows.map((d) => (
          <tr key={d.id}>
            <Td muted className="font-mono caption-5">{formatDate(d.createdAt, true)}</Td>
            <Td className="font-mono caption-5">{d.event}{d.replayOf ? <span className="text-text-subtle"> (replay)</span> : null}</Td>
            <Td><Badge tone={TONE[d.status] ?? "info"}>{MARK[d.status] ?? ""} {d.status}</Badge></Td>
            <Td align="right" className="font-mono caption-5">{d.lastStatusCode ?? "none"}</Td>
            <Td align="right" muted className="font-mono caption-5">{d.lastLatencyMs != null ? `${d.lastLatencyMs} ms` : "none"}</Td>
            <Td align="right" muted>{d.attempts}</Td>
            <Td align="right">
              {canReplay ? <Button variant="secondary" size="sm" loading={busy === d.id} disabled={!!busy} onClick={() => replay(d)} aria-label={`Replay ${d.event} from ${formatDate(d.createdAt, true)}`}>Replay</Button> : null}
            </Td>
          </tr>
        ))}
      </DataTable>
      {list.error ? <ErrorState title="Refresh failed" body={list.error} /> : null}
    </div>
  );
}
