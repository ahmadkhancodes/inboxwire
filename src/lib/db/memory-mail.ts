import { uuidv7 } from "@/lib/ids";
import type { AccountCredential, ConnectLink, DeletionRecord, Environment, LicenceRecord, MailAccount, MailStore, OAuthClient, OrgKey, OutboxItem, SyncCursor } from "./mail-types";

/** In-memory MailStore (same semantics as mongo-mail.ts; shared contract in tests/unit/mailstore.test.ts). */
export function createMemoryMailStore(app: string): MailStore {
  const envs = new Map<string, Environment>();
  const keys = new Map<string, OrgKey>();
  const clients = new Map<string, OAuthClient>();
  const accounts = new Map<string, MailAccount>();
  const creds = new Map<string, AccountCredential>();
  const cursors = new Map<string, SyncCursor>();
  const links = new Map<string, ConnectLink>();
  const outbox = new Map<string, OutboxItem>();
  const licences = new Map<string, LicenceRecord>();
  const deletions: DeletionRecord[] = [];
  const eligible = (o: OutboxItem, now: Date) => (o.status === "queued" || o.status === "sending") && !!o.nextAttemptAt && o.nextAttemptAt <= now;
  const clone = <T>(x: T): T => structuredClone(x);
  const orEnvs = (orgId: string) => new Set([...envs.values()].filter((e) => e.orgId === orgId).map((e) => e.id));

  return {
    async ensureEnvironment(orgId, name) {
      const hit = [...envs.values()].find((e) => e.orgId === orgId && e.name === name);
      if (hit) return clone(hit);
      const e: Environment = { id: uuidv7(), app, orgId, name, createdAt: new Date() };
      envs.set(e.id, e);
      return clone(e);
    },
    async getEnvironment(id) { const e = envs.get(id); return e ? clone(e) : null; },
    async listEnvironments(orgId) { return [...envs.values()].filter((e) => e.orgId === orgId).map(clone); },
    async getOrgKey(orgId) { const k = keys.get(orgId); return k ? clone(k) : null; },
    async putOrgKey(orgId, wrappedDek) {
      const hit = keys.get(orgId);
      if (hit) return clone(hit);
      const k: OrgKey = { orgId, app, wrappedDek, createdAt: new Date() };
      keys.set(orgId, k);
      return clone(k);
    },
    async upsertOAuthClient(c) {
      const k = `${c.envId}|${c.provider}`;
      const prev = clients.get(k);
      const now = new Date();
      const next: OAuthClient = { ...c, app, createdAt: prev?.createdAt ?? now, updatedAt: now, id: prev?.id ?? c.id };
      clients.set(k, next);
      return clone(next);
    },
    async getOAuthClient(envId, provider) { const c = clients.get(`${envId}|${provider}`); return c ? clone(c) : null; },
    async listOAuthClients(envId) { return [...clients.values()].filter((c) => c.envId === envId).map(clone); },
    async deleteOAuthClient(envId, provider) { clients.delete(`${envId}|${provider}`); },
    async upsertAccount(a) {
      const prev = [...accounts.values()].find((x) => x.envId === a.envId && x.externalId === a.externalId);
      const next: MailAccount = { ...a, id: prev?.id ?? a.id, app, createdAt: prev?.createdAt ?? new Date() };
      accounts.set(next.id, next);
      return clone(next);
    },
    async getAccount(id) { const a = accounts.get(id); return a ? clone(a) : null; },
    async findAccountByEmail(envId, email) {
      const a = [...accounts.values()].find((x) => x.envId === envId && x.email.toLowerCase() === email.toLowerCase());
      return a ? clone(a) : null;
    },
    async findAccountByWatchId(watchId) {
      const a = [...accounts.values()].find((x) => x.watch?.id === watchId);
      return a ? clone(a) : null;
    },
    async listAccounts(envId) { return [...accounts.values()].filter((a) => a.envId === envId).map(clone); },
    async updateAccount(id, patch) { const a = accounts.get(id); if (a) accounts.set(id, { ...a, ...clone(patch) }); },
    async dueAccounts(now, limit) {
      return [...accounts.values()]
        .filter((a) => a.mode === "polling" && a.state !== "authenticationError" && a.nextPollAt && a.nextPollAt <= now)
        .sort((x, y) => x.nextPollAt!.getTime() - y.nextPollAt!.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async renewableAccounts(before, limit) {
      return [...accounts.values()].filter((a) => a.mode === "push" && a.state !== "authenticationError" && a.watch?.expiresAt && a.watch.expiresAt <= before)
        .sort((a, b) => a.watch!.expiresAt!.getTime() - b.watch!.expiresAt!.getTime()).slice(0, limit).map(clone);
    },
    async setCredentials(c) { creds.set(c.accountId, { ...clone(c), app, updatedAt: new Date() }); },
    async getCredentials(id) { const c = creds.get(id); return c ? clone(c) : null; },
    async setCursor(c) { cursors.set(`${c.accountId}|${c.folder}`, { ...clone(c), app, updatedAt: new Date() }); },
    async getCursor(id, folder) { const c = cursors.get(`${id}|${folder}`); return c ? clone(c) : null; },
    async createConnectLink(l) {
      const link: ConnectLink = { ...clone(l), app, createdAt: new Date(), usedAt: null };
      links.set(link.id, link);
      return clone(link);
    },
    async getConnectLink(id) { const l = links.get(id); return l ? clone(l) : null; },
    async getConnectLinkByState(stateHash) {
      const l = [...links.values()].find((x) => x.oauth?.stateHash === stateHash);
      return l ? clone(l) : null;
    },
    async setConnectLinkOAuth(id, oauth) { const l = links.get(id); if (l) l.oauth = oauth ? clone(oauth) : null; },
    async consumeConnectLink(id, now) {
      const l = links.get(id);
      if (!l || l.usedAt || l.expiresAt <= now) return false;
      l.usedAt = now;
      l.oauth = null;
      return true;
    },
    async insertOutbox(o) {
      const hit = [...outbox.values()].find((x) => x.accountId === o.accountId && x.idempotencyKey === o.idempotencyKey);
      if (hit) return { item: clone(hit), created: false };
      const item: OutboxItem = { ...clone(o), app };
      outbox.set(item.id, item);
      return { item: clone(item), created: true };
    },
    async getOutbox(envId, id) { const o = outbox.get(id); return o && o.envId === envId ? clone(o) : null; },
    async updateOutbox(id, patch) { const o = outbox.get(id); if (o) outbox.set(id, { ...o, ...clone(patch) }); },
    async claimOutbox(id, now, leaseMs) {
      const o = outbox.get(id);
      if (!o || !eligible(o, now)) return null;
      const next: OutboxItem = { ...o, status: "sending", attempts: o.attempts + 1, nextAttemptAt: new Date(now.getTime() + leaseMs), updatedAt: now };
      outbox.set(id, next);
      return clone(next);
    },
    async dueOutbox(now, limit) {
      return [...outbox.values()].filter((o) => eligible(o, now)).sort((a, b) => a.nextAttemptAt!.getTime() - b.nextAttemptAt!.getTime()).slice(0, limit).map(clone);
    },
    async listOutbox(envIds, limit) {
      return [...outbox.values()].filter((o) => envIds.includes(o.envId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map(clone);
    },
    async deleteAccountData(accountId) {
      const n = { accounts: 0, credentials: 0, cursors: 0, outbox: 0 };
      if (accounts.delete(accountId)) n.accounts++;
      if (creds.delete(accountId)) n.credentials++;
      for (const [k, c] of cursors) if (c.accountId === accountId) { cursors.delete(k); n.cursors++; }
      for (const [k, o] of outbox) if (o.accountId === accountId) { outbox.delete(k); n.outbox++; }
      return n;
    },
    async insertLicence(l) {
      const hit = [...licences.values()].find((x) => x.invoiceId === l.invoiceId);
      if (hit) return { licence: clone(hit), created: false };
      const rec: LicenceRecord = { ...l, app };
      licences.set(rec.id, rec);
      return { licence: clone(rec), created: true };
    },
    async listLicences(orgId) { return [...licences.values()].filter((l) => l.orgId === orgId).sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime()).map(clone); },
    async addDeletionRecord(r) { const rec: DeletionRecord = { ...r, app, at: r.at ?? new Date() }; deletions.push(rec); return clone(rec); },
    async listDeletionRecords(orgId) { return deletions.filter((d) => d.orgId === orgId).sort((a, b) => b.at.getTime() - a.at.getTime()).map(clone); },
    async mailCounts() {
      const tally = (xs: string[]) => xs.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
      return { accounts: tally([...accounts.values()].map((a) => a.state)), outbox: tally([...outbox.values()].map((o) => o.status)) };
    },
    async deleteMailData(orgId) {
      const ids = orEnvs(orgId);
      for (const [k, o] of outbox) if (ids.has(o.envId)) outbox.delete(k);
      const accIds = new Set([...accounts.values()].filter((a) => ids.has(a.envId)).map((a) => a.id));
      for (const [k, c] of clients) if (ids.has(c.envId)) clients.delete(k);
      for (const [k, l] of links) if (ids.has(l.envId)) links.delete(k);
      for (const id of accIds) { accounts.delete(id); creds.delete(id); }
      for (const [k, c] of cursors) if (accIds.has(c.accountId)) cursors.delete(k);
      for (const id of ids) envs.delete(id);
      keys.delete(orgId);
      for (const [k, l] of licences) if (l.orgId === orgId) licences.delete(k);
    },
  };
}
