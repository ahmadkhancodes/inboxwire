import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import { runUptimeProbe, summarize, STATUS_DAYS } from "@/lib/status";

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const chk = (target: string, ok: boolean, ms: number, at: number) => ({ id: String(at), app: "t", target, ok, ms, httpStatus: null, at: new Date(at) });

describe("status summary", () => {
  it("builds 90 daily buckets with up/degraded/down states", () => {
    const day = 86_400_000;
    const out = summarize(
      [chk("api", true, 50, NOW - 1000), chk("api", false, 900, NOW - day), chk("api", true, 60, NOW - day + 1000), chk("api", false, 900, NOW - 2 * day)],
      NOW,
    );
    const api = out.find((t) => t.id === "api")!;
    expect(api.days).toHaveLength(STATUS_DAYS);
    expect(api.days.at(-1)!.state).toBe("up");
    expect(api.days.at(-2)!.state).toBe("down"); // 1 of 2 failed
    expect(api.days.at(-3)!.state).toBe("down");
    expect(api.days.at(-4)!.state).toBe("none");
    expect(api.current).toBe("up");
    expect(api.uptimePct).toBe(50);
  });
  it("reports unknown with no samples", () => {
    const db = summarize([], NOW).find((t) => t.id === "database")!;
    expect(db.current).toBe("unknown");
    expect(db.uptimePct).toBeNull();
  });
});

describe("uptime probe", () => {
  it("records both targets, then skips while a sample is fresh", async () => {
    const db = createMemoryDb("t");
    const ok = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const first = await runUptimeProbe({ db, baseUrl: "http://x.test", now: NOW, fetchImpl: ok });
    expect(first).toMatchObject({ skipped: false, api: true, database: true });
    expect((await db.listUptimeChecks({ since: new Date(0) })).length).toBe(2);
    expect(await runUptimeProbe({ db, baseUrl: "http://x.test", now: NOW + 60_000, fetchImpl: ok })).toEqual({ skipped: true });
  });
  it("records a failing API", async () => {
    const db = createMemoryDb("t");
    const bad = (async () => new Response("no", { status: 503 })) as typeof fetch;
    expect(await runUptimeProbe({ db, baseUrl: "http://x.test", now: NOW, fetchImpl: bad })).toMatchObject({ api: false, database: true });
    const [c] = await db.listUptimeChecks({ since: new Date(0), target: "api" });
    expect(c).toMatchObject({ ok: false, httpStatus: 503 });
  });
});
