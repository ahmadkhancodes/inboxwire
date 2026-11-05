import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cronJobs } from "@/lib/cron/jobs";

describe("M4 cron wiring", () => {
  it("registers the purge and the index job; indexes are skipped on the memory driver", async () => {
    expect(Object.keys(cronJobs)).toEqual(expect.arrayContaining(["purge-canceled", "ensure-indexes"]));
    expect(await cronJobs["ensure-indexes"]!()).toEqual({ skipped: "memory driver" });
    expect(await cronJobs["purge-canceled"]!()).toMatchObject({ orgs: 0, accounts: 0 });
  });
  it("the Cloudflare worker and the Vercel fallback both schedule the purge", () => {
    expect(readFileSync("infra/cron-worker/wrangler.toml", "utf8")).toMatch(/JOBS = ".*purge-canceled/);
    expect(JSON.parse(readFileSync("vercel.json", "utf8")).crons.map((c: { path: string }) => c.path)).toContain("/api/cron/purge-canceled");
  });
  it("the self-host worker calls every job the app registers for it", () => {
    const src = readFileSync("scripts/selfhost-cron.mjs", "utf8");
    for (const job of ["ensure-indexes", "webhook-retries", "poll-imap", "outbox-send", "renew-watches", "purge-canceled"]) {
      expect(src).toContain(job);
      expect(Object.keys(cronJobs)).toContain(job);
    }
  });
});
