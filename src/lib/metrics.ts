import type { Db } from "@/lib/db/types";

// Prometheus text exposition (format 0.0.4). Counts come from the Db so every instance reports the same totals;
// there are no per-request counters because serverless instances would each report a different slice.

export interface MetricsInput {
  accounts: Record<string, number>;
  outbox: Record<string, number>;
  deliveries: Record<string, number>;
  version: string;
  uptimeSeconds: number;
  now?: Date;
}

export const ACCOUNT_STATES = ["connecting", "syncing", "connected", "throttled", "authenticationError", "connectError"] as const;
export const OUTBOX_STATUSES = ["queued", "sending", "sent", "failed"] as const;
export const DELIVERY_STATUSES = ["pending", "succeeded", "failed", "retrying"] as const;

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

function family(lines: string[], name: string, help: string, type: "gauge" | "counter", samples: [Record<string, string>, number][]) {
  lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
  for (const [labels, value] of samples) {
    const l = Object.entries(labels).map(([k, v]) => `${k}="${esc(v)}"`).join(",");
    lines.push(`${name}${l ? `{${l}}` : ""} ${Number.isFinite(value) ? value : 0}`);
  }
}

const byKey = (known: readonly string[], counts: Record<string, number>, label: string): [Record<string, string>, number][] =>
  [...new Set([...known, ...Object.keys(counts)])].map((k) => [{ [label]: k }, counts[k] ?? 0]);

export function renderMetrics(i: MetricsInput): string {
  const lines: string[] = [];
  family(lines, "inboxwire_up", "1 when this instance can read its database.", "gauge", [[{}, 1]]);
  family(lines, "inboxwire_build_info", "Build information.", "gauge", [[{ version: i.version }, 1]]);
  family(lines, "inboxwire_process_uptime_seconds", "Seconds since this process started.", "gauge", [[{}, Math.round(i.uptimeSeconds)]]);
  family(lines, "inboxwire_scrape_timestamp_seconds", "Unix time of this scrape.", "gauge", [[{}, Math.floor((i.now ?? new Date()).getTime() / 1000)]]);
  family(lines, "inboxwire_accounts", "Connected mailboxes by state.", "gauge", byKey(ACCOUNT_STATES, i.accounts, "state"));
  family(lines, "inboxwire_outbox_items", "Queued and finished sends (kept 7 days) by status.", "gauge", byKey(OUTBOX_STATUSES, i.outbox, "status"));
  family(lines, "inboxwire_webhook_deliveries", "Webhook deliveries in the log (kept up to 90 days) by status.", "gauge", byKey(DELIVERY_STATUSES, i.deliveries, "status"));
  return lines.join("\n") + "\n";
}

const started = Date.now();

export async function collectMetrics(db: Db, version = process.env.npm_package_version ?? "0.1.0", now = new Date()): Promise<string> {
  const [mail, deliveries] = await Promise.all([db.mailCounts(), db.deliveryCounts()]);
  return renderMetrics({ accounts: mail.accounts, outbox: mail.outbox, deliveries, version, uptimeSeconds: (now.getTime() - started) / 1000, now });
}
