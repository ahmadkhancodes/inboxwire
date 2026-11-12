import { getDb } from "@/lib/db";
import { dbDriver, env } from "@/lib/env";

export interface Health {
  ok: boolean;
  /** Overall: ok = everything required works, degraded = the database is slow or down. */
  status: "ok" | "degraded";
  db: { driver: string; state: "up" | "slow" | "down"; ms: number };
  /** Configuration only (never the values, never a live call to a third party). */
  services: { billing: "configured" | "not_configured"; mail: "configured" | "not_configured" };
  version: string;
  at: string;
}

const SLOW_MS = 1500;
const DOWN_MS = 3000;

/** Real database probe with a hard timeout. Reports state words only: no hostnames, no driver errors. */
export async function checkHealth(now = Date.now): Promise<Health> {
  const e = env();
  const t0 = now();
  let state: Health["db"]["state"] = "up";
  try {
    const probe = (async () => (await getDb()).getUsage("health", "ping", "0"))();
    probe.catch(() => {});
    await Promise.race([probe, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), DOWN_MS).unref?.())]);
  } catch {
    state = "down";
  }
  const ms = now() - t0;
  if (state === "up" && ms > SLOW_MS) state = "slow";
  const mailProvider = e.MAIL_PROVIDER ?? (e.RESEND_API_KEY ? "resend" : "console");
  return {
    ok: state !== "down",
    status: state === "up" ? "ok" : "degraded",
    db: { driver: dbDriver(e), state, ms },
    services: {
      billing: e.STRIPE_SECRET_KEY ? "configured" : "not_configured",
      mail: mailProvider === "resend" ? (e.RESEND_API_KEY ? "configured" : "not_configured") : mailProvider === "none" ? "not_configured" : "configured",
    },
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    at: new Date(now()).toISOString(),
  };
}
