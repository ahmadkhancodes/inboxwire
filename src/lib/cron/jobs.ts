import { purgeCanceled } from "@/lib/accounts/deletion";
import { pollDueAccounts } from "@/lib/cron/poll";
import { renewWatches } from "@/lib/cron/renew";
import { product } from "@/config/product";
import { getDb } from "@/lib/db";
import { dbDriver, env } from "@/lib/env";
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
  "purge-canceled": async () => purgeCanceled(await getDb()),
  // Idempotent. The self-host worker calls it once at start (the Docker image has no tsx for scripts/ensure-indexes.ts).
  "ensure-indexes": async () => {
    const e = env();
    if (dbDriver(e) !== "mongo" || !e.MONGODB_URI) return { skipped: "memory driver" };
    await (await import("@/lib/db/mongo")).ensureIndexes(e.MONGODB_URI, e.MONGODB_DB ?? product.slug);
    return { ok: true };
  },
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
