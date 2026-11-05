import type { MeterId } from "@/config/product";
import type { Db } from "@/lib/db/types";
import { effectivePlan, limitFor } from "./entitlement";

// Metering hooks (MAU, mailboxes, devices, submissions...). Period = calendar month UTC.
export const periodOf = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export interface UsageState {
  meter: MeterId;
  used: number;
  limit: number;
  ratio: number;
  /** "ok" < 80%, "near" 80-99%, "over" >= 100% */
  level: "ok" | "near" | "over";
}

export function usageState(meter: MeterId, used: number, limit: number): UsageState {
  const ratio = limit <= 0 ? (used > 0 ? 1 : 0) : used / limit;
  return { meter, used, limit, ratio, level: ratio >= 1 ? "over" : ratio >= 0.8 ? "near" : "ok" };
}

/** Count one unit and report whether it is within the plan (soft cap: caller decides to hold, never drop). */
export async function meter(db: Db, orgId: string, m: MeterId, by = 1, now = new Date()): Promise<UsageState & { within: boolean }> {
  const ent = await db.getEntitlement(orgId);
  const used = await db.incUsage(orgId, m, periodOf(now), by);
  const limit = limitFor(ent, m, now.getTime());
  return { ...usageState(m, used, limit), within: used <= limit };
}

/** Active mailboxes: every account in every environment of the org. The one number the meter, `GET /v1/usage` and the Stripe quantity share. */
export async function countMailboxes(db: Db, orgId: string): Promise<number> {
  let n = 0;
  for (const e of await db.listEnvironments(orgId)) n += (await db.listAccounts(e.id)).length;
  return n;
}

async function used(db: Db, orgId: string, m: MeterId, now: Date): Promise<number> {
  if (m === "mailboxes") return countMailboxes(db, orgId);
  if (m === "environments") return (await db.listEnvironments(orgId)).length;
  return db.getUsage(orgId, m, periodOf(now));
}

export async function currentUsage(db: Db, orgId: string, meters: MeterId[], now = new Date()): Promise<UsageState[]> {
  const ent = await db.getEntitlement(orgId);
  const plan = effectivePlan(ent, now.getTime());
  return Promise.all(meters.map(async (m) => usageState(m, await used(db, orgId, m, now), plan.limits[m])));
}
