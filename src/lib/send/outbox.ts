import { backendFor, type BackendDeps, type Emit } from "@/lib/backends";
import type { Db, OutboxItem } from "@/lib/db/types";
import { OUTBOX_RETENTION_MS } from "@/lib/db/mail-types";
import { HttpError } from "@/lib/http";
import { sha256, uuidv7 } from "@/lib/ids";
import type { SendRequest } from "@/lib/mailcore";
import { openForOrg, orgOfEnv, sealForOrg } from "@/lib/secrets";

export const MAX_SEND_ATTEMPTS = 5;
export const MAX_SEND_AHEAD_MS = 30 * 86_400_000;
const LEASE_MS = 2 * 60_000;
/** Wait after failed attempt n (1-based): 1 min, 5 min, 30 min, 2 h. */
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000];
/** Errors a retry cannot fix. */
const PERMANENT = /smtp_not_configured|no_credentials|invalid_grant|auth|not_found|rejected|\b(400|401|403|404|550|553|554)\b/i;

export interface EnqueueInput { envId: string; accountId: string; request: SendRequest; idempotencyKey?: string | null; now?: Date }

/** Canonical request hash so a reused Idempotency-Key with a different body is caught. */
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canonical(x)])) : v;
export async function requestHash(req: SendRequest): Promise<string> {
  return sha256(JSON.stringify(canonical(req)));
}

/**
 * Queues a send. Same (account, Idempotency-Key) returns the original item (`replayed: true`) without sending again, for 7 days;
 * the same key with a different body is a 422. Without a key every call queues a new message.
 */
export async function enqueueSend(db: Db, input: EnqueueInput): Promise<{ item: OutboxItem; replayed: boolean }> {
  const now = input.now ?? new Date();
  const key = input.idempotencyKey?.trim() || null;
  if (key && (key.length > 255 || !/^[\x21-\x7e]+$/.test(key))) throw new HttpError(400, "invalid_idempotency_key");
  const sendAt = input.request.sendAt ? new Date(input.request.sendAt) : now;
  if (sendAt.getTime() - now.getTime() > MAX_SEND_AHEAD_MS) throw new HttpError(400, "send_at_too_far");
  const orgId = await orgOfEnv(db, input.envId);
  const id = uuidv7(now.getTime());
  const hash = await requestHash(input.request);
  const { item, created } = await db.insertOutbox({
    id, envId: input.envId, accountId: input.accountId, idempotencyKey: key ?? `auto_${id}`, requestHash: hash, status: "queued", attempts: 0,
    sendAt: sendAt < now ? now : sendAt, nextAttemptAt: sendAt < now ? now : sendAt, payloadEnc: await sealForOrg(db, orgId, JSON.stringify(input.request)),
    result: null, error: null, createdAt: now, updatedAt: now, expireAt: new Date(now.getTime() + OUTBOX_RETENTION_MS),
  });
  if (!created && item.requestHash !== hash) throw new HttpError(422, "idempotency_key_reused", { message: "This Idempotency-Key was used with a different request." });
  return { item, replayed: !created };
}

export interface ProcessDeps extends BackendDeps { emit?: Emit }

/** Sends one queued item if it is due and nobody else holds it. Never throws for send failures: the item records them. */
export async function processOutbox(db: Db, id: string, deps: ProcessDeps = {}): Promise<OutboxItem | null> {
  const now = deps.now ?? new Date();
  const item = await db.claimOutbox(id, now, LEASE_MS);
  if (!item) return null;
  const orgId = await orgOfEnv(db, item.envId);
  const emit: Emit = deps.emit ?? (async (o, t, d, c) => (await import("@/lib/webhooks/outbound")).emitEvent(o, t, d, { db, envId: c?.envId }));
  const fail = async (msg: string, permanent: boolean) => {
    const last = permanent || item.attempts >= MAX_SEND_ATTEMPTS;
    const patch = last
      ? { status: "failed" as const, error: msg.slice(0, 200), nextAttemptAt: null, payloadEnc: null, updatedAt: now }
      : { status: "queued" as const, error: msg.slice(0, 200), nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)]!), updatedAt: now };
    await db.updateOutbox(item.id, patch);
    if (last) await emit(orgId, "messageFailed", { accountId: item.accountId, outboxId: item.id, error: patch.error }, { envId: item.envId }).catch(() => {});
    return { ...item, ...patch };
  };
  const account = await db.getAccount(item.accountId);
  if (!account || account.envId !== item.envId) return fail("account_not_found", true);
  if (!item.payloadEnc) return fail("payload_expired", true);
  let backend = null;
  try {
    const request = JSON.parse(await openForOrg(db, orgId, item.payloadEnc)) as SendRequest;
    backend = await backendFor(db, account, deps);
    const sent = await backend.send(request);
    const patch = { status: "sent" as const, result: { id: sent.id, threadId: sent.threadId }, error: null, nextAttemptAt: null, payloadEnc: null, updatedAt: now };
    await db.updateOutbox(item.id, patch);
    await emit(orgId, "messageSent", { accountId: item.accountId, outboxId: item.id, messageId: sent.id, threadId: sent.threadId }, { envId: item.envId }).catch(() => {});
    return { ...item, ...patch };
  } catch (e) {
    const msg = (e as Error).message || "send_failed";
    return fail(msg, PERMANENT.test(msg));
  } finally {
    await backend?.close().catch(() => {});
  }
}

/** `outbox-send` cron: items whose sendAt has come, retries, and items whose worker died (lease ended). */
export async function runDueOutbox(opts: ProcessDeps & { db: Db; limit?: number; budgetMs?: number }) {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const due = await opts.db.dueOutbox(now, opts.limit ?? 50);
  let sent = 0, failed = 0, retried = 0;
  for (const d of due) {
    if (Date.now() - started > (opts.budgetMs ?? 45_000)) break;
    const r = await processOutbox(opts.db, d.id, opts);
    if (!r) continue;
    if (r.status === "sent") sent++; else if (r.status === "failed") failed++; else retried++;
  }
  return { due: due.length, sent, failed, retried };
}
