import { createMemoryDb } from "@/lib/db/memory";
import type { Db, MailAccount } from "@/lib/db/types";
import type { ImapClientLike, ImapFactory, FetchedMessage } from "@/lib/backends/imap";
import { createConnectLink } from "@/lib/connect/links";
import { sealForOrg } from "@/lib/secrets";

export const newDb = () => createMemoryDb("inboxwire");

export async function setupEnv(db: Db, orgId = "org_1") {
  const env = await db.ensureEnvironment(orgId, "production");
  return { env, orgId };
}

export interface FakeImapState { uidValidity: number; uidNext: number; failLogin?: boolean; uids: number[]; connects: number }

export function fakeImap(state: FakeImapState): ImapFactory {
  return () => {
    const c: ImapClientLike = {
      async connect() { state.connects++; if (state.failLogin) throw new Error("Invalid credentials (auth failed)"); },
      async logout() {},
      async mailboxOpen() { return { uidValidity: state.uidValidity, uidNext: state.uidNext }; },
      async *fetch(range: string): AsyncIterable<FetchedMessage> {
        const from = Number(range.split(":")[0]);
        for (const uid of state.uids) if (uid >= from) yield { uid, flags: new Set<string>(), envelope: { subject: `m${uid}`, date: new Date(0) } };
      },
      async fetchOne() { return false; },
      async search() { return state.uids; },
      async messageFlagsAdd() {}, async messageFlagsRemove() {}, async messageMove() {}, async messageDelete() {},
    };
    return c;
  };
}

export async function imapAccount(db: Db, state: FakeImapState, orgId = "org_1", over: Partial<MailAccount> = {}) {
  const { env } = await setupEnv(db, orgId);
  const a = await db.upsertAccount({
    id: `acc_${Math.random().toString(36).slice(2)}`, envId: env.id, externalId: `ext_${Math.random()}`, email: "ana@example.test", provider: "imap", backend: "imap",
    state: "syncing", lastError: null, nextPollAt: new Date(0), mode: "polling", ...over,
  });
  await db.setCredentials({ accountId: a.id, imapSmtpEnc: await sealForOrg(db, orgId, JSON.stringify({ imap: { host: "imap.example.test", port: 993, secure: true, user: "ana", pass: "pw" } })) });
  void state;
  return a;
}

export async function newLink(db: Db, orgId = "org_1", extra: { redirectUrl?: string; externalId?: string; now?: Date } = {}) {
  const { env } = await setupEnv(db, orgId);
  const { token } = await createConnectLink(db, { envId: env.id, ...extra });
  return { token, env };
}
