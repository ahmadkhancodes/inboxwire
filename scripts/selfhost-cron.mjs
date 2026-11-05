#!/usr/bin/env node
// Self-host worker: calls the app's cron endpoints on a schedule (the hosted service uses a Cloudflare cron worker for this).
// Env: APP_URL (default http://app:3000), CRON_SECRET (required), JOBS (comma list), INTERVAL_SECONDS (default 60).
const base = (process.env.APP_URL ?? "http://app:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
const jobs = (process.env.JOBS ?? "ensure-indexes,webhook-retries,poll-imap,outbox-send,renew-watches,uptime-probe,purge-canceled").split(",").map((s) => s.trim()).filter(Boolean);
const every = Math.max(10, Number(process.env.INTERVAL_SECONDS ?? 60)) * 1000;
if (!secret) { console.error("CRON_SECRET is required"); process.exit(1); }
// Slow jobs run less often than the per-minute ones.
// ensure-indexes runs once, on the first tick (tick % huge === 1 only at tick 1).
const EVERY_N = { "ensure-indexes": 1_000_000_000, "renew-watches": 60, "purge-canceled": 1440, "uptime-probe": 5 };
let tick = 0;
async function run() {
  tick++;
  for (const job of jobs) {
    if (tick % (EVERY_N[job] ?? 1) !== 1 && (EVERY_N[job] ?? 1) !== 1) continue;
    try {
      const r = await fetch(`${base}/api/cron/${job}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55_000) });
      if (!r.ok) console.error(`cron ${job}: HTTP ${r.status}`);
    } catch (e) { console.error(`cron ${job}: ${e.message}`); }
  }
}
await run();
setInterval(run, every);
