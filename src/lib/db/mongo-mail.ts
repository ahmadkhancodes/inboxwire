import type { Collection, Db as MongoDatabase, Document } from "mongodb";
import { uuidv7 } from "@/lib/ids";
import type { AccountCredential, ConnectLink, Environment, MailAccount, MailStore, OAuthClient, OrgKey, OutboxItem, SyncCursor } from "./mail-types";

type WithId<T> = T & { _id: string };

/** Mongo MailStore. Every query carries `app`. Indexes: see ensureMailIndexes. */
export function createMongoMailStore(getDb: () => Promise<MongoDatabase>, app: string): MailStore {
  const col = async <T extends Document>(name: string) => (await getDb()).collection<T>(name) as unknown as Collection<T>;
  const strip = <T>(d: unknown): T | null => {
    if (!d) return null;
    const { _id: _i, ...rest } = d as Record<string, unknown>;
    return rest as T;
  };
  const stripAll = <T>(docs: unknown[]): T[] => docs.map((d) => strip<T>(d)!);
  const dupKey = (e: unknown) => (e as { code?: number }).code === 11000;

  return {
    async ensureEnvironment(orgId, name) {
      const c = await col<WithId<Environment>>("environments");
      const hit = await c.findOne({ app, orgId, name });
      if (hit) return strip<Environment>(hit)!;
      const e: Environment = { id: uuidv7(), app, orgId, name, createdAt: new Date() };
      try { await c.insertOne({ _id: e.id, ...e }); return e; } catch (err) {
        if (!dupKey(err)) throw err;
        return strip<Environment>(await c.findOne({ app, orgId, name }))!;
      }
    },
    async getEnvironment(id) { return strip<Environment>(await (await col<WithId<Environment>>("environments")).findOne({ _id: id, app })); },
    async listEnvironments(orgId) { return stripAll<Environment>(await (await col<WithId<Environment>>("environments")).find({ app, orgId }).toArray()); },
    async getOrgKey(orgId) { return strip<OrgKey>(await (await col<WithId<OrgKey>>("org_keys")).findOne({ _id: `${app}:${orgId}` })); },
    async putOrgKey(orgId, wrappedDek) {
      const c = await col<WithId<OrgKey>>("org_keys");
      await c.updateOne({ _id: `${app}:${orgId}` }, { $setOnInsert: { orgId, app, wrappedDek, createdAt: new Date() } }, { upsert: true });
      return strip<OrgKey>(await c.findOne({ _id: `${app}:${orgId}` }))!;
    },
    async upsertOAuthClient(c) {
      const { id, ...rest } = c;
      const now = new Date();
      const coll = await col<WithId<OAuthClient>>("oauth_clients");
      await coll.updateOne({ app, envId: c.envId, provider: c.provider }, { $set: { ...rest, app, updatedAt: now }, $setOnInsert: { _id: id, id, createdAt: now } }, { upsert: true });
      return strip<OAuthClient>(await coll.findOne({ app, envId: c.envId, provider: c.provider }))!;
    },
    async getOAuthClient(envId, provider) { return strip<OAuthClient>(await (await col<WithId<OAuthClient>>("oauth_clients")).findOne({ app, envId, provider })); },
    async listOAuthClients(envId) { return stripAll<OAuthClient>(await (await col<WithId<OAuthClient>>("oauth_clients")).find({ app, envId }).toArray()); },
    async deleteOAuthClient(envId, provider) { await (await col("oauth_clients")).deleteOne({ app, envId, provider }); },
    async upsertAccount(a) {
      const { id, ...rest } = a;
      const coll = await col<WithId<MailAccount>>("accounts");
      await coll.updateOne({ app, envId: a.envId, externalId: a.externalId }, { $set: { ...rest, app }, $setOnInsert: { _id: id, id, createdAt: new Date() } }, { upsert: true });
      return strip<MailAccount>(await coll.findOne({ app, envId: a.envId, externalId: a.externalId }))!;
    },
    async getAccount(id) { return strip<MailAccount>(await (await col<WithId<MailAccount>>("accounts")).findOne({ _id: id, app })); },
    async findAccountByEmail(envId, email) { return strip<MailAccount>(await (await col<WithId<MailAccount>>("accounts")).findOne({ app, envId, email: email.toLowerCase() })); },
    async findAccountByWatchId(watchId) { return strip<MailAccount>(await (await col<WithId<MailAccount>>("accounts")).findOne({ app, "watch.id": watchId })); },
    async listAccounts(envId) { return stripAll<MailAccount>(await (await col<WithId<MailAccount>>("accounts")).find({ app, envId }).sort({ createdAt: 1 }).toArray()); },
    async updateAccount(id, patch) { await (await col<WithId<MailAccount>>("accounts")).updateOne({ _id: id, app }, { $set: patch }); },
    async dueAccounts(now, limit) {
      return stripAll<MailAccount>(await (await col<WithId<MailAccount>>("accounts"))
        .find({ app, mode: "polling", state: { $ne: "authenticationError" }, nextPollAt: { $lte: now } })
        .sort({ nextPollAt: 1 }).limit(limit).toArray());
    },
    async renewableAccounts(before, limit) {
      return stripAll<MailAccount>(await (await col<WithId<MailAccount>>("accounts"))
        .find({ app, mode: "push", state: { $ne: "authenticationError" }, "watch.expiresAt": { $lte: before } })
        .sort({ "watch.expiresAt": 1 }).limit(limit).toArray());
    },
    async setCredentials(c) { await (await col<WithId<AccountCredential>>("account_credentials")).replaceOne({ _id: c.accountId }, { ...c, app, updatedAt: new Date() }, { upsert: true }); },
    async getCredentials(id) { return strip<AccountCredential>(await (await col<WithId<AccountCredential>>("account_credentials")).findOne({ _id: id, app })); },
    async setCursor(c) { await (await col<WithId<SyncCursor>>("sync_cursors")).replaceOne({ _id: `${c.accountId}|${c.folder}` }, { ...c, app, updatedAt: new Date() }, { upsert: true }); },
    async getCursor(id, folder) { return strip<SyncCursor>(await (await col<WithId<SyncCursor>>("sync_cursors")).findOne({ _id: `${id}|${folder}`, app })); },
    async createConnectLink(l) {
      const link: ConnectLink = { ...l, app, createdAt: new Date(), usedAt: null };
      await (await col<WithId<ConnectLink>>("connect_links")).insertOne({ _id: link.id, ...link });
      return link;
    },
    async getConnectLink(id) { return strip<ConnectLink>(await (await col<WithId<ConnectLink>>("connect_links")).findOne({ _id: id, app })); },
    async getConnectLinkByState(stateHash) { return strip<ConnectLink>(await (await col<WithId<ConnectLink>>("connect_links")).findOne({ app, "oauth.stateHash": stateHash })); },
    async setConnectLinkOAuth(id, oauth) { await (await col<WithId<ConnectLink>>("connect_links")).updateOne({ _id: id, app }, { $set: { oauth: oauth ?? null } }); },
    async consumeConnectLink(id, now) {
      const r = await (await col<WithId<ConnectLink>>("connect_links")).updateOne(
        { _id: id, app, usedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now, oauth: null } },
      );
      return r.modifiedCount === 1;
    },
    async insertOutbox(o) {
      const c = await col<WithId<OutboxItem>>("outbox");
      const item: OutboxItem = { ...o, app };
      try { await c.insertOne({ _id: item.id, ...item }); return { item, created: true }; } catch (err) {
        if (!dupKey(err)) throw err;
        return { item: strip<OutboxItem>(await c.findOne({ app, accountId: o.accountId, idempotencyKey: o.idempotencyKey }))!, created: false };
      }
    },
    async getOutbox(envId, id) { return strip<OutboxItem>(await (await col<WithId<OutboxItem>>("outbox")).findOne({ _id: id, app, envId })); },
    async updateOutbox(id, patch) { await (await col<WithId<OutboxItem>>("outbox")).updateOne({ _id: id, app }, { $set: patch }); },
    async claimOutbox(id, now, leaseMs) {
      const r = await (await col<WithId<OutboxItem>>("outbox")).findOneAndUpdate(
        { _id: id, app, status: { $in: ["queued", "sending"] }, nextAttemptAt: { $lte: now } },
        { $set: { status: "sending", nextAttemptAt: new Date(now.getTime() + leaseMs), updatedAt: now }, $inc: { attempts: 1 } },
        { returnDocument: "after" },
      );
      return strip<OutboxItem>(r);
    },
    async dueOutbox(now, limit) {
      return stripAll<OutboxItem>(await (await col<WithId<OutboxItem>>("outbox"))
        .find({ app, status: { $in: ["queued", "sending"] }, nextAttemptAt: { $lte: now } }).sort({ nextAttemptAt: 1 }).limit(limit).toArray());
    },
    async deleteMailData(orgId) {
      const d = await getDb();
      const envIds = (await d.collection("environments").find({ app, orgId }).project({ _id: 1 }).toArray()).map((e) => String(e._id));
      const accIds = (await d.collection("accounts").find({ app, envId: { $in: envIds } }).project({ _id: 1 }).toArray()).map((e) => String(e._id));
      await d.collection("account_credentials").deleteMany({ _id: { $in: accIds as never[] } });
      await d.collection("sync_cursors").deleteMany({ app, accountId: { $in: accIds } });
      await d.collection("accounts").deleteMany({ app, envId: { $in: envIds } });
      await d.collection("oauth_clients").deleteMany({ app, envId: { $in: envIds } });
      await d.collection("connect_links").deleteMany({ app, envId: { $in: envIds } });
      await d.collection("outbox").deleteMany({ app, envId: { $in: envIds } });
      await d.collection("environments").deleteMany({ app, orgId });
      await d.collection("org_keys").deleteOne({ _id: `${app}:${orgId}` as never });
    },
  };
}

/** Unique/TTL indexes for the M2 collections. Called by ensureIndexes (npm run db:indexes). */
export async function ensureMailIndexes(d: MongoDatabase) {
  await d.collection("environments").createIndex({ app: 1, orgId: 1, name: 1 }, { unique: true });
  await d.collection("oauth_clients").createIndex({ app: 1, envId: 1, provider: 1 }, { unique: true });
  await d.collection("accounts").createIndex({ app: 1, envId: 1, externalId: 1 }, { unique: true });
  await d.collection("accounts").createIndex({ app: 1, envId: 1, email: 1 });
  await d.collection("accounts").createIndex({ app: 1, mode: 1, state: 1, nextPollAt: 1 });
  await d.collection("accounts").createIndex({ app: 1, "watch.id": 1 }, { partialFilterExpression: { "watch.id": { $type: "string" } } });
  await d.collection("sync_cursors").createIndex({ app: 1, accountId: 1 });
  await d.collection("accounts").createIndex({ app: 1, mode: 1, "watch.expiresAt": 1 });
  await d.collection("outbox").createIndex({ app: 1, accountId: 1, idempotencyKey: 1 }, { unique: true });
  await d.collection("outbox").createIndex({ app: 1, status: 1, nextAttemptAt: 1 });
  // Idempotency-Key retention: 7 days from creation.
  await d.collection("outbox").createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
  await d.collection("webhook_endpoints").createIndex({ app: 1, orgId: 1, envId: 1 });
  await d.collection("connect_links").createIndex({ app: 1, envId: 1 });
  await d.collection("connect_links").createIndex({ "oauth.stateHash": 1 }, { partialFilterExpression: { "oauth.stateHash": { $type: "string" } } });
  // Expired links are kept 7 days for the 410 explanation, then dropped.
  await d.collection("connect_links").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 7 * 86400 });
}
