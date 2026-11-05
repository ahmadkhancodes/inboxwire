import type { Db } from "@/lib/db/types";
import { snapshot, type LineView } from "./lines";

// Server-sent events for the dashboard. A serverless function cannot hold a stream forever, so the stream ends after
// `maxMs` and the browser's EventSource reconnects on its own (`retry:`), sending Last-Event-ID so no event is repeated.

export interface StreamOpts {
  db: Db;
  orgId: string;
  signal?: AbortSignal;
  /** Poll the database this often. State changes reach the browser within one interval (target: under 5 s). */
  intervalMs?: number;
  /** Close the stream after this long. */
  maxMs?: number;
  /** Last-Event-ID of the previous connection (ISO time of the newest event the client has). */
  lastEventAt?: string | null;
  sleep?: (ms: number) => Promise<void>;
}

const enc = new TextEncoder();
export const sse = (event: string, data: unknown, id?: string) => enc.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const fingerprint = (lines: LineView[]) => JSON.stringify(lines.map((l) => [l.id, l.state, l.mode, l.lastError, l.lastEvent?.id ?? null]));

export function createLiveStream(o: StreamOpts): ReadableStream<Uint8Array> {
  const interval = o.intervalMs ?? 2000;
  const maxMs = o.maxMs ?? 50_000;
  const sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = Date.now();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const push = (b: Uint8Array) => { if (!cancelled) ctrl.enqueue(b); };
      o.signal?.addEventListener("abort", () => { cancelled = true; try { ctrl.close(); } catch { /* already closed */ } });
      push(enc.encode(`retry: ${interval + 1000}\n\n`));
      let print = "";
      let since = o.lastEventAt ?? "";
      let first = true;
      try {
        while (!cancelled) {
          const snap = await snapshot(o.db, o.orgId);
          const fp = fingerprint(snap.lines);
          if (first) {
            push(sse("snapshot", { lines: snap.lines, events: snap.events, at: snap.at }, snap.events[0]?.at));
            if (!since && snap.events[0]) since = snap.events[0].at;
            first = false; print = fp;
            if (o.lastEventAt) for (const e of snap.events.filter((e) => e.at > o.lastEventAt!).reverse()) push(sse("ticker", e, e.at));
          } else {
            if (fp !== print) { print = fp; push(sse("lines", snap.lines)); }
            for (const e of snap.events.filter((e) => e.at > since).reverse()) { push(sse("ticker", e, e.at)); since = e.at; }
            push(enc.encode(": ping\n\n"));
          }
          if (Date.now() - started + interval >= maxMs) break;
          await sleep(interval);
        }
      } catch {
        push(sse("error", { message: "stream_failed" }));
      }
      if (!cancelled) { try { ctrl.close(); } catch { /* already closed */ } }
    },
    cancel() { cancelled = true; },
  });
}
