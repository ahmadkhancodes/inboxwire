import { getDb } from "@/lib/db";
import type { Db, UptimeCheck } from "@/lib/db/types";
import { product } from "@/config/product";

export const STATUS_DAYS = 90;
/** The probe job runs every minute (Cloudflare cron) but only stores a sample this often. */
export const PROBE_EVERY_MS = 5 * 60_000;
const DAY = 86_400_000;
const PROBE_TIMEOUT_MS = 8000;

export const STATUS_TARGETS = [
  { id: "api", label: "REST API", detail: "GET /api/health" },
  { id: "database", label: "Database", detail: "Write and read round trip" },
] as const;
export type StatusTarget = (typeof STATUS_TARGETS)[number]["id"];

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T }> {
  const t = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - t, value };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

/** Probes our own API and database and stores one UptimeCheck per target. Skips if a sample is fresh. */
export async function runUptimeProbe(opts: { db?: Db; baseUrl?: string; now?: number; fetchImpl?: typeof fetch } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? Date.now();
  const recent = await db.listUptimeChecks({ since: new Date(now - PROBE_EVERY_MS), limit: 1 });
  if (recent.length) return { skipped: true as const };
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl ?? product.url;

  let httpStatus: number | null = null;
  const api = await timed(async () => {
    const r = await doFetch(`${base}/api/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: "no-store" });
    httpStatus = r.status;
    if (!r.ok) throw new Error(`status ${r.status}`);
  });
  const database = await timed(async () => {
    await db.getConfig();
  });
  const at = new Date(now);
  await db.recordUptimeCheck({ target: "api", ok: api.ok, ms: api.ms, httpStatus, at });
  await db.recordUptimeCheck({ target: "database", ok: database.ok, ms: database.ms, httpStatus: null, at });
  return { skipped: false as const, api: api.ok, database: database.ok };
}

export type DayState = "up" | "degraded" | "down" | "none";
export interface DayBucket {
  /** UTC date, YYYY-MM-DD */
  date: string;
  state: DayState;
  checks: number;
  failed: number;
}
export interface TargetSummary {
  id: StatusTarget;
  label: string;
  detail: string;
  current: "up" | "down" | "unknown";
  /** Percent over the window, null with no samples. One decimal. */
  uptimePct: number | null;
  /** Median response time in ms over the last 24 h, null with no samples. */
  medianMs: number | null;
  lastCheckedAt: Date | null;
  days: DayBucket[];
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

function bucketState(checks: number, failed: number): DayState {
  if (checks === 0) return "none";
  const failPct = failed / checks;
  if (failPct === 0) return "up";
  return failPct >= 0.5 ? "down" : "degraded";
}

/** Pure: turns raw checks (any order) into per-target lamp rows with 90 daily buckets. */
export function summarize(checks: UptimeCheck[], now = Date.now(), days = STATUS_DAYS): TargetSummary[] {
  const keys = Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * DAY));
  return STATUS_TARGETS.map((t) => {
    const mine = checks.filter((c) => c.target === t.id).sort((a, b) => b.at.getTime() - a.at.getTime());
    const perDay = new Map<string, { n: number; bad: number }>();
    for (const c of mine) {
      const k = dayKey(c.at.getTime());
      const cur = perDay.get(k) ?? { n: 0, bad: 0 };
      cur.n++;
      if (!c.ok) cur.bad++;
      perDay.set(k, cur);
    }
    const buckets: DayBucket[] = keys.map((date) => {
      const v = perDay.get(date) ?? { n: 0, bad: 0 };
      return { date, state: bucketState(v.n, v.bad), checks: v.n, failed: v.bad };
    });
    const total = buckets.reduce((a, b) => a + b.checks, 0);
    const bad = buckets.reduce((a, b) => a + b.failed, 0);
    const lastDay = mine.filter((c) => c.at.getTime() >= now - DAY).map((c) => c.ms).sort((a, b) => a - b);
    return {
      id: t.id,
      label: t.label,
      detail: t.detail,
      current: mine.length === 0 ? "unknown" : mine[0]!.ok ? "up" : "down",
      uptimePct: total ? Math.round(((total - bad) / total) * 1000) / 10 : null,
      medianMs: lastDay.length ? lastDay[Math.floor(lastDay.length / 2)]! : null,
      lastCheckedAt: mine[0]?.at ?? null,
      days: buckets,
    };
  });
}

export async function loadStatus(db?: Db, now = Date.now()) {
  const d = db ?? (await getDb());
  const checks = await d.listUptimeChecks({ since: new Date(now - STATUS_DAYS * DAY), limit: 40_000 });
  return summarize(checks, now);
}
