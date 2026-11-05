import { pollDueAccounts } from "@/lib/cron/poll";
import { runUptimeProbe } from "@/lib/status";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  "poll-imap": () => pollDueAccounts(),
  "uptime-probe": () => runUptimeProbe(),
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
