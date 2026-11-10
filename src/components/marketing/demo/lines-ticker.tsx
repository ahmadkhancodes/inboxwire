import { cadence } from "@/config/product";
import { StatusLamp, type LampState } from "@/components/ui/status-lamp";

interface Line { id: string; provider: string; state: LampState; last: string; mode: string }
const LINES: Line[] = [
  { id: "ops@northwind-crm.example", provider: "Google", state: "live", last: "2 s ago", mode: "push" },
  { id: "dana@harbor-law.example", provider: "Microsoft", state: "live", last: "9 s ago", mode: "push" },
  { id: "intake@kestrel-ats.example", provider: "IMAP", state: "syncing", last: cadence.demoImapLast, mode: "polling" },
  { id: "m.okafor@tidewater.example", provider: "Google", state: "error", last: "3 h ago", mode: "push" },
];
interface Stamp { t: string; type: string; line: string; code: number; ms?: number; retry?: string }
const TAPE: Stamp[] = [
  { t: "14:02:07", type: "messageNew", line: "ops@northwind…", code: 200, ms: 84 },
  { t: "14:01:58", type: "messageMoved", line: "dana@harbor…", code: 200, ms: 112 },
  { t: "14:01:31", type: "messageNew", line: "intake@kestrel…", code: 500, retry: cadence.demoRetry },
  { t: "14:01:12", type: "messageSent", line: "ops@northwind…", code: 200, ms: 97 },
];

export function Tape({ stamps = TAPE, className = "" }: { stamps?: Stamp[]; className?: string }) {
  return (
    <ol className={`m-0 list-none bg-tape p-0 font-mono caption-5 ${className}`} aria-label="Webhook ticker">
      {stamps.map((s) => (
        <li key={s.t + s.type} className="flex flex-wrap gap-x-3 border-b border-dotted border-border px-4 py-1 last:border-b-0">
          <span className="text-text-subtle">{s.t}</span>
          <span className="text-text">{s.type}</span>
          <span className="text-text-subtle">{s.line}</span>
          {s.code === 200
            ? <span className="text-success">200 ✓ {s.ms} ms</span>
            : <span className="text-danger">{s.code} ■ retry {s.retry}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Static illustration of the real Lines table + ticker: believable example data, cropped to one panel on small screens. */
export function LinesTicker() {
  return (
    <figure className="m-0">
      <figcaption className="sr-only">Example of the Inboxwire by BufferSol Lines table with a status lamp per mailbox and the webhook ticker below it</figcaption>
      <div className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-[0_1px_0_rgba(22,25,28,.06),0_1px_3px_rgba(22,25,28,.08)] dark:shadow-none">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-sunken px-4 py-2 font-mono caption-4 text-text-subtle">
          <span>Lines · northwind-crm / production</span>
          <span>4 of 4 watched</span>
        </div>
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-border font-mono caption-4 text-text-subtle">
              <th scope="col" className="w-3/5 px-4 py-2 font-medium md:w-2/5">Line</th>
              <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">Provider</th>
              <th scope="col" className="px-4 py-2 font-medium">State</th>
              <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">Mode</th>
              <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">Last event</th>
            </tr>
          </thead>
          <tbody>
            {LINES.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-b-0">
                <td className="truncate px-4 py-2 font-mono caption-5 text-text">{l.id}</td>
                <td className="hidden px-4 py-2 body-6 text-text md:table-cell">{l.provider}</td>
                <td className="px-4 py-2"><StatusLamp state={l.state} /></td>
                <td className="hidden px-4 py-2 font-mono caption-5 text-text-subtle md:table-cell">{l.mode}</td>
                <td className="hidden px-4 py-2 font-mono caption-5 text-text-subtle md:table-cell">{l.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Tape className="border-t border-dashed border-border-strong" />
      </div>
    </figure>
  );
}
