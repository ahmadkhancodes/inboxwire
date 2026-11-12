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
    <ol className={`m-0 list-none bg-tape p-0 font-mono caption-5 ${className}`} aria-label="Webhook delivery log">
      {stamps.map((s) => (
        <li key={s.t + s.type} className="grid grid-cols-2 gap-x-3 border-b border-border px-4 py-2 last:border-b-0">
          <span className="text-text-muted tabular-nums">{s.t}</span>
          {s.code === 200
            ? <span className="justify-self-end text-success tabular-nums">200 ✓ {s.ms} ms</span>
            : <span className="justify-self-end text-danger">{s.code} ■ retry {s.retry}</span>}
          <span className="text-text">{s.type}</span>
          <span className="justify-self-end truncate text-text-subtle">{s.line}</span>
        </li>
      ))}
    </ol>
  );
}

/** Static illustration of the real Lines table + delivery log: believable example data, cropped to one panel on small screens. */
export function LinesTicker() {
  return (
    <figure className="m-0">
      <figcaption className="sr-only">Example of the Inboxwire by BufferSol Lines table with a status lamp per mailbox and the webhook delivery log beside it</figcaption>
      <div className="border border-border-strong bg-surface-raised">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2 font-mono caption-5 text-text-subtle">
          <span><span className="text-text">northwind-crm</span> / production / lines</span>
          <span className="hidden sm:inline">4 lines · 3 healthy · 1 needs sign-in</span>
        </div>
        <div className="grid lg:grid-cols-12">
          <table className="w-full table-fixed border-collapse text-left lg:col-span-8">
            <thead>
              <tr className="border-b border-border bg-surface-sunken font-mono caption-5 text-text-muted">
                <th scope="col" className="w-3/5 px-4 py-2 font-normal md:w-2/5">Line</th>
                <th scope="col" className="hidden px-4 py-2 font-normal md:table-cell">Provider</th>
                <th scope="col" className="px-4 py-2 font-normal">State</th>
                <th scope="col" className="hidden px-4 py-2 font-normal md:table-cell">Mode</th>
                <th scope="col" className="hidden px-4 py-2 font-normal md:table-cell">Last event</th>
              </tr>
            </thead>
            <tbody>
              {LINES.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-b-0">
                  <td className="truncate px-4 py-3 font-mono caption-5 text-text">{l.id}</td>
                  <td className="hidden px-4 py-3 body-6 text-text md:table-cell">{l.provider}</td>
                  <td className="px-4 py-3"><StatusLamp state={l.state} /></td>
                  <td className="hidden px-4 py-3 font-mono caption-5 text-text-subtle md:table-cell">{l.mode}</td>
                  <td className="hidden px-4 py-3 font-mono caption-5 text-text-subtle md:table-cell">{l.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border lg:col-span-4 lg:border-l lg:border-t-0">
            <p className="border-b border-border bg-surface-sunken px-4 py-2 font-mono caption-5 text-text-muted">Webhook deliveries</p>
            <Tape />
          </div>
        </div>
      </div>
    </figure>
  );
}
