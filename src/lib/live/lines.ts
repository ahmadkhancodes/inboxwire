import type { Db, MailAccount, OutboxItem, WebhookDelivery } from "@/lib/db/types";

// Read models for the dashboard: Lines (mailboxes), the per-line timeline, error explanations and the event ticker.
// Everything is derived from rows we already keep; there is no separate event store.

export type LampKind = "live" | "syncing" | "error" | "throttled" | "idle";

export interface Explanation { title: string; cause: string; fix: string }

/** One entry per state of the account state machine. */
export function explainState(a: Pick<MailAccount, "state" | "provider" | "lastError" | "mode">): Explanation {
  const prov = a.provider === "google" ? "Google" : a.provider === "microsoft" ? "Microsoft" : "the mail server";
  switch (a.state) {
    case "connected":
      return { title: "Live", cause: a.mode === "push" ? `${prov} pushes changes to us as they happen.` : "We check this mailbox on a schedule (polling mode), so new mail shows up within about a minute.", fix: a.mode === "push" ? "Nothing to do." : a.provider === "google" ? "For faster detection add a Pub/Sub topic to your Google OAuth client." : "Polling is the only mode for this provider on the hosted plan." };
    case "syncing":
      return { title: "Syncing", cause: "We are reading the mailbox for the first time or catching up after a gap.", fix: "Nothing to do. Events start when the first sync finishes." };
    case "connecting":
      return { title: "Connecting", cause: "The connect link was used and we are opening the first session.", fix: "If this stays for more than a few minutes, create a new connect link for the user." };
    case "throttled":
      return { title: "Throttled", cause: `${prov} asked us to slow down. We back off and retry on our own.`, fix: "Nothing to do. If it repeats, check the API quota of your OAuth client." };
    case "authenticationError":
      return { title: "Sign-in needed", cause: a.provider === "imap" ? "The server rejected the saved login (password changed, app password revoked, or access disabled)." : `${prov} no longer accepts the saved authorisation (access revoked, password changed, or consent expired).`, fix: "Send the user a new connect link so they sign in again. Polling for this line is paused until then." };
    case "connectError":
      return { title: "Cannot reach the server", cause: a.lastError ? `The last attempt failed: ${a.lastError}` : "We could not open a connection to the mail server.", fix: a.provider === "imap" ? "Check the host, port and TLS settings with the user. We keep retrying." : "Usually temporary. We keep retrying; check the provider's status page." };
  }
}

export const lampOf = (a: Pick<MailAccount, "state">): LampKind =>
  a.state === "connected" ? "live" : a.state === "syncing" ? "syncing" : a.state === "throttled" ? "throttled" : a.state === "authenticationError" || a.state === "connectError" ? "error" : "idle";

/** Short lamp label per state. Not "auth error" for both error states: an unreachable server is not a sign-in problem. */
export const lampLabel = (a: Pick<MailAccount, "state">): string =>
  ({ connected: "live", syncing: "syncing", connecting: "connecting", throttled: "throttled", authenticationError: "sign-in needed", connectError: "unreachable" })[a.state];

export interface LineEvent { id: string; type: string; accountId: string | null; at: string }

export interface LineView {
  id: string;
  email: string;
  provider: MailAccount["provider"];
  backend: MailAccount["backend"];
  env: string;
  state: MailAccount["state"];
  lamp: LampKind;
  lampLabel: string;
  mode: MailAccount["mode"];
  lastError: string | null;
  explanation: Explanation;
  lastEvent: LineEvent | null;
  connectedAt: string;
}

const parse = (d: WebhookDelivery): { accountId: string | null } => {
  try {
    const p = JSON.parse(d.payload) as { data?: { accountId?: string; account?: string } };
    return { accountId: p.data?.accountId ?? p.data?.account ?? null };
  } catch { return { accountId: null }; }
};

/** One event per event id (several endpoints and replays share it), newest first. */
export function eventsFrom(deliveries: WebhookDelivery[], limit = 50): LineEvent[] {
  const seen = new Set<string>();
  const out: LineEvent[] = [];
  for (const d of [...deliveries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const id = d.eventId ?? d.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, type: d.event, accountId: parse(d).accountId, at: d.createdAt.toISOString() });
    if (out.length >= limit) break;
  }
  return out;
}

export async function loadLines(db: Db, orgId: string, deliveries?: WebhookDelivery[]): Promise<LineView[]> {
  const envs = await db.listEnvironments(orgId);
  const events = eventsFrom(deliveries ?? (await db.listDeliveries(orgId, { limit: 300 })), 300);
  const last = new Map<string, LineEvent>();
  for (const e of events) if (e.accountId && !last.has(e.accountId)) last.set(e.accountId, e);
  const lines: LineView[] = [];
  for (const env of envs) {
    for (const a of await db.listAccounts(env.id)) {
      lines.push({
        id: a.id, email: a.email, provider: a.provider, backend: a.backend, env: env.name, state: a.state, lamp: lampOf(a), lampLabel: lampLabel(a), mode: a.mode, lastError: a.lastError,
        explanation: explainState(a), lastEvent: last.get(a.id) ?? null, connectedAt: a.createdAt.toISOString(),
      });
    }
  }
  return lines.sort((a, b) => a.email.localeCompare(b.email));
}

export interface TimelineEntry { at: string; kind: "connected" | "event" | "send" | "watch" | "state"; title: string; detail?: string }

/** Newest first. Built from the account, its webhook events and its outbox: no extra storage. */
export function buildTimeline(a: MailAccount, deliveries: WebhookDelivery[], outbox: OutboxItem[], now = new Date()): TimelineEntry[] {
  const t: TimelineEntry[] = [{ at: a.createdAt.toISOString(), kind: "connected", title: "Connected", detail: `${a.provider} via ${a.backend}` }];
  for (const e of eventsFrom(deliveries, 200)) if (e.accountId === a.id) t.push({ at: e.at, kind: "event", title: e.type });
  for (const o of outbox) if (o.accountId === a.id) t.push({ at: o.createdAt.toISOString(), kind: "send", title: `Send ${o.status}`, detail: o.error ?? (o.attempts > 1 ? `${o.attempts} attempts` : undefined) });
  if (a.watch?.expiresAt) t.push({ at: a.watch.expiresAt.toISOString(), kind: "watch", title: a.watch.expiresAt > now ? "Push subscription renews" : "Push subscription expired", detail: a.watch.expiresAt > now ? "scheduled" : "polling takes over" });
  if (a.state !== "connected" && a.state !== "syncing") t.push({ at: now.toISOString(), kind: "state", title: explainState(a).title, detail: a.lastError ?? undefined });
  return t.sort((x, y) => y.at.localeCompare(x.at));
}

export interface LiveSnapshot { lines: LineView[]; events: LineEvent[]; at: string }

export async function snapshot(db: Db, orgId: string, now = new Date()): Promise<LiveSnapshot> {
  const deliveries = await db.listDeliveries(orgId, { limit: 300 });
  return { lines: await loadLines(db, orgId, deliveries), events: eventsFrom(deliveries, 50), at: now.toISOString() };
}
