import { pollDueAccounts } from "@/lib/cron/poll";
import { renewWatches } from "@/lib/cron/renew";
import { getDb } from "@/lib/db";
import { runDueOutbox } from "@/lib/send/outbox";
import { runUptimeProbe } from "@/lib/status";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  "poll-imap": () => pollDueAccounts(),
  "renew-watches": () => renewWatches(),
  "outbox-send": async () => runDueOutbox({ db: await getDb() }),
  "uptime-probe": () => runUptimeProbe(),
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
