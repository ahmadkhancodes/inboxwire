import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleIndexes } from "@/lib/db/mongo";

beforeEach(() => { globalThis.__kitIndexes = undefined; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("auto indexes", () => {
  it("runs once and not again on a second call", async () => {
    const run = vi.fn(async () => {});
    await scheduleIndexes("u", "d", run);
    await scheduleIndexes("u", "d", run);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("does not run at build time", () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const run = vi.fn(async () => {});
    scheduleIndexes("u", "d", run);
    expect(run).not.toHaveBeenCalled();
  });
  it("an index error never throws and allows a retry", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValueOnce(new Error("secret mongodb://user:pw@h")).mockResolvedValue(undefined);
    await expect(scheduleIndexes("u", "d", run)).resolves.toBeUndefined();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("pw");
    await scheduleIndexes("u", "d", run);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("is skipped for the memory driver", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    expect(db).toBeTruthy();
    expect(globalThis.__kitIndexes?.size ?? 0).toBe(0);
  });
});
