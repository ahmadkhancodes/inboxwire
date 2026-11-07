import { syncAccount, type BackendDeps, type Emit } from "@/lib/backends";
import type { Db } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { validateGmailPush, validateGraphNotifications, type JwkFetcher } from "./validate";

type Deps = BackendDeps & { emit?: Emit; getKey?: JwkFetcher };
export interface HookResponse { status: number; body: unknown; text?: string }

/** Gmail Pub/Sub push. Always 2xx once validated (Pub/Sub retries non-2xx), even if the account is unknown. */
export async function handleGmailHook(db: Db, envId: string, req: { url: string; authorization: string | null; body: unknown }, deps: Deps = {}): Promise<HookResponse> {
  if (!(await db.getEnvironment(envId))) return { status: 404, body: { error: "unknown_environment" } };
  const client = await db.getOAuthClient(envId, "google");
  const url = new URL(req.url);
  const v = await validateGmailPush({ envId, url, authorization: req.authorization, body: req.body, serviceAccount: client?.pubsubServiceAccount, audience: `${appUrl()}${url.pathname}` }, deps.getKey);
  if (!v.ok) return { status: v.status, body: { error: v.error } };
  const account = await db.findAccountByEmail(envId, v.value.emailAddress);
  if (!account) return { status: 200, body: { ok: true, ignored: "unknown_account" } };
  const r = await syncAccount(db, account.id, deps);
  return { status: 200, body: { ok: true, events: r.events } };
}

/** Microsoft Graph: validationToken handshake, clientState check, lifecycle notifications, then delta sync. */
export async function handleGraphHook(db: Db, envId: string, req: { url: string; body: unknown }, deps: Deps = {}): Promise<HookResponse> {
  const token = new URL(req.url).searchParams.get("validationToken");
  if (token) return { status: 200, body: null, text: token };
  if (!(await db.getEnvironment(envId))) return { status: 404, body: { error: "unknown_environment" } };
  const v = validateGraphNotifications(envId, req.body);
  if (!v.ok) return { status: v.status, body: { error: v.error } };
  let events = 0;
  const seen = new Set<string>();
  for (const n of v.value) {
    if (seen.has(n.subscriptionId)) continue;
    seen.add(n.subscriptionId);
    const account = await db.findAccountByWatchId(n.subscriptionId);
    if (!account || account.envId !== envId) continue; // a subscription id only counts on its own environment's hook
    if (n.lifecycleEvent) {
      // Renewal is done by cron; mark the subscription as due now.
      if (n.lifecycleEvent === "subscriptionRemoved" || n.lifecycleEvent === "reauthorizationRequired") await db.updateAccount(account.id, { watch: { id: account.watch?.id ?? null, expiresAt: new Date() } });
      continue;
    }
    events += (await syncAccount(db, account.id, deps)).events;
  }
  return { status: 202, body: { ok: true, events } };
}
