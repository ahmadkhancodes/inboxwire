import { afterEach, describe, expect, it, vi } from "vitest";
import { syncAccount } from "@/lib/backends";
import { imapflowFactory } from "@/lib/backends/imap";
import { buildRfc822 } from "@/lib/backends/mime";
import { completeImap } from "@/lib/connect/complete";
import { assertLink, lookupConnectLink } from "@/lib/connect/links";
import { deleteOrgMailboxes } from "@/lib/accounts/deletion";
import type { MailAccount } from "@/lib/db/types";
import { handleGraphHook } from "@/lib/hooks/handle";
import { hookToken, sealForOrg } from "@/lib/secrets";
import { assertPublicHost, isPrivateAddress, isPublicHostname } from "@/lib/security/net";
import { attemptDelivery, isSafeWebhookUrl } from "@/lib/webhooks/outbound";
import { fakeImap, imapAccount, newDb, newLink, setupEnv } from "./m2-helpers";

// M5 pre-launch review: regression tests for every P0 (and the small P1s fixed with them). See docs/REVIEW.md.

describe("P0-1 SSRF guard (src/lib/security/net.ts)", () => {
  it("classifies private, loopback, link-local, CGNAT, mapped and ULA addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "224.0.0.1"])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "142.250.1.1", "2606:4700::1111", "172.32.0.1", "100.128.0.1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("rejects internal names, single labels (docker/k8s services) and private literals; DNS answers are checked", async () => {
    for (const h of ["localhost", "mongo", "redis", "db.internal", "printer.local", "127.0.0.1", "[::1]"]) expect(isPublicHostname(h), h).toBe(false);
    await expect(assertPublicHost("imap.evil.com", { lookup: async () => ["93.184.216.34", "10.0.0.7"] })).rejects.toThrow("private_address");
    await expect(assertPublicHost("imap.fastmail.com", { lookup: async () => ["103.168.172.1"] })).resolves.toBeUndefined();
    await expect(assertPublicHost("nowhere.example.org", { lookup: async () => { throw new Error("ENOTFOUND"); } })).resolves.toBeUndefined();
    await expect(assertPublicHost("10.0.0.5", { source: { ALLOW_PRIVATE_NETWORK_TARGETS: "1" } })).resolves.toBeUndefined();
  });

  it("IMAP connect refuses internal IMAP and SMTP hosts before dialing and keeps the link", async () => {
    for (const bad of [{ imap: "127.0.0.1" }, { imap: "169.254.169.254" }, { imap: "mongo" }, { imap: "imap.example.test", smtp: "10.0.0.2" }]) {
      const db = newDb();
      const { token } = await newLink(db);
      const link = assertLink(await lookupConnectLink(db, token));
      const state = { uidValidity: 1, uidNext: 1, uids: [], connects: 0 };
      const input = { email: "ana@example.test", imap: { host: bad.imap, port: 993, secure: true, user: "ana", pass: "pw" }, smtp: bad.smtp ? { host: bad.smtp, port: 465, secure: true } : undefined };
      await expect(completeImap(db, link, input, { imapFactory: fakeImap(state), noBilling: true })).rejects.toMatchObject({ status: 422, code: "mail_host_not_allowed" });
      expect(state.connects).toBe(0);
      expect((await lookupConnectLink(db, token)).ok).toBe(true);
    }
  });

  it("an IMAP account whose stored host now points inside is not polled", async () => {
    const db = newDb();
    const state = { uidValidity: 1, uidNext: 1, uids: [], connects: 0 };
    const a = await imapAccount(db, state);
    await db.setCredentials({ accountId: a.id, imapSmtpEnc: await sealForOrg(db, "org_1", JSON.stringify({ imap: { host: "imap.rebound-dns.com", port: 993, secure: true, user: "ana", pass: "pw" } })) });
    const r = await syncAccount(db, a.id, { imapFactory: fakeImap(state), lookup: async () => ["192.168.1.20"] });
    expect(r).toMatchObject({ ok: false, error: "private_address" });
    expect(state.connects).toBe(0);
  });

  it("webhook URLs: single-label hosts, CGNAT and credentials are refused; DNS is re-checked at delivery", async () => {
    for (const u of ["https://mongo:27017/", "https://100.64.1.1/x", "https://user:pw@hooks.example.com/", "https://db.internal/x"]) expect(isSafeWebhookUrl(u), u).toBe(false);
    const db = newDb();
    const ep = await db.createWebhookEndpoint({ id: "ep1", orgId: "o1", url: "https://hooks.attacker.com/x", secret: "whsec_1", events: ["*"], enabled: true });
    const now = new Date();
    const d = { id: "d1", eventId: "d1", envId: null, app: db.app, orgId: "o1", endpointId: "ep1", event: "messageNew", payload: "{}", status: "pending" as const, attempts: 0, nextAttemptAt: now, lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now, expireAt: now };
    await db.createDelivery(d);
    const fetchFn = vi.fn(async () => new Response("ok"));
    const r = await attemptDelivery(d, ep, { db, fetchFn: fetchFn as never, now, lookup: async () => ["169.254.169.254"], notify: async () => {} });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ lastError: "unsafe_target", status: "retrying" });
  });
});

describe("P0-2 IMAP never sends the password in clear", () => {
  it("requires STARTTLS when implicit TLS is off", () => {
    const plain = imapflowFactory({ host: "imap.example.test", port: 143, secure: false, user: "u", pass: "p" }) as unknown as { options: { doSTARTTLS?: boolean } };
    expect(plain.options.doSTARTTLS).toBe(true);
    const tls = imapflowFactory({ host: "imap.example.test", port: 993, secure: true, user: "u", pass: "p" }) as unknown as { options: { doSTARTTLS?: boolean; secure: boolean } };
    expect(tls.options.secure).toBe(true);
  });
});

describe("P0-3 sync never loses webhook events", () => {
  it("does not move the cursor when queueing an event fails, so the next sync re-reads the changes", async () => {
    const db = newDb();
    const state = { uidValidity: 7, uidNext: 10, uids: [10, 11, 12], connects: 0 };
    const a = await imapAccount(db, state);
    await db.setCursor({ accountId: a.id, folder: "INBOX", uidvalidity: "7", uidnext: 10 });
    state.uidNext = 13;
    await db.createWebhookEndpoint({ id: "ep1", orgId: "org_1", url: "https://hooks.test/x", secret: "whsec_1", events: ["*"], enabled: true });
    const real = db.createDelivery.bind(db);
    let calls = 0;
    db.createDelivery = async (d) => { if (++calls === 2) throw new Error("mongo down"); return real(d); };
    const r = await syncAccount(db, a.id, { imapFactory: fakeImap(state), deliverBudgetMs: -1 });
    expect(r.ok).toBe(false);
    expect((await db.getCursor(a.id, "INBOX"))?.uidnext).toBe(10);
  });

  it("queues every event before delivering, so a slow receiver cannot drop the tail", async () => {
    const db = newDb();
    const state = { uidValidity: 7, uidNext: 10, uids: [10, 11, 12], connects: 0 };
    const a = await imapAccount(db, state);
    await db.setCursor({ accountId: a.id, folder: "INBOX", uidvalidity: "7", uidnext: 10 });
    state.uidNext = 13;
    await db.createWebhookEndpoint({ id: "ep1", orgId: "org_1", url: "https://hooks.test/x", secret: "whsec_1", events: ["*"], enabled: true });
    const r = await syncAccount(db, a.id, { imapFactory: fakeImap(state), deliverBudgetMs: -1 });
    expect(r).toMatchObject({ ok: true, events: 3 });
    const due = await db.dueDeliveries(new Date(Date.now() + 1000), 10);
    expect(due).toHaveLength(3);
    expect((await db.getCursor(a.id, "INBOX"))?.uidnext).toBe(13);
  });
});

describe("P1 fixes shipped with the review", () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock("@/lib/auth/session"); });

  it("an IMAP connect cannot take over a mailbox row owned by another end user", async () => {
    const db = newDb();
    const { env } = await setupEnv(db);
    await db.upsertAccount({ id: "acc_a", envId: env.id, externalId: "user-a", email: "ceo@corp.test", provider: "google", backend: "gmail_api", state: "connected", lastError: null, nextPollAt: null, mode: "push" });
    const { token } = await newLink(db, "org_1", { externalId: "user-b" });
    const link = assertLink(await lookupConnectLink(db, token));
    const input = { email: "ceo@corp.test", imap: { host: "imap.example.test", port: 993, secure: true, user: "x", pass: "y" } };
    await expect(completeImap(db, link, input, { imapFactory: fakeImap({ uidValidity: 1, uidNext: 1, uids: [], connects: 0 }), noBilling: true })).rejects.toMatchObject({ status: 409, code: "mailbox_already_connected" });
    expect((await db.getAccount("acc_a"))?.backend).toBe("gmail_api");
  });

  it("a key bound to production cannot reach development (403), and defaults to its own environment", async () => {
    vi.doMock("@/lib/auth/session", () => ({ authApiKey: async () => ({ orgId: "org_e", keyId: "k", scopes: ["read"], environment: "staging" }) }));
    const { authEnv } = await import("@/lib/connect/env");
    const db = newDb();
    await expect(authEnv(new Request("http://x.test/v1", { headers: { "x-environment": "development" } }), "read", db)).rejects.toMatchObject({ status: 403, code: "environment_not_allowed" });
    expect((await authEnv(new Request("http://x.test/v1"), "read", db)).env.name).toBe("staging");
  });

  it("a Graph subscription id only triggers a sync on its own environment's hook", async () => {
    const db = newDb();
    const { env } = await setupEnv(db, "org_1");
    const other = await db.ensureEnvironment("org_2", "production");
    const a: MailAccount = await db.upsertAccount({ id: "ms1", envId: env.id, externalId: "m", email: "bo@corp.test", provider: "microsoft", backend: "graph", state: "connected", lastError: null, nextPollAt: null, mode: "push", watch: { id: "sub-1", expiresAt: new Date(Date.now() + 86_400_000) } });
    const graph = vi.fn();
    const body = { value: [{ subscriptionId: "sub-1", clientState: hookToken(other.id), changeType: "created" }] };
    await handleGraphHook(db, other.id, { url: "https://x.test/h", body }, { graph: graph as never, emit: async () => {} });
    expect(graph).not.toHaveBeenCalled();
    expect((await db.getAccount(a.id))?.state).toBe("connected");
  });

  it("strips CR/LF from a parent Message-ID used for threading", () => {
    const raw = buildRfc822("a@b.test", { to: [{ address: "c@d.test" }], text: "hi" }, { inReplyTo: "<x@y>\r\nBcc: victim@evil.test" });
    expect(raw).not.toMatch(/\r\nBcc:/);
  });

  it("org deletion revokes every mailbox's Google token and writes deletion records", async () => {
    const db = newDb();
    const { env } = await setupEnv(db, "org_del");
    const a = await db.upsertAccount({ id: "g1", envId: env.id, externalId: "u", email: "u@gmail.test", provider: "google", backend: "gmail_api", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
    await db.setCredentials({ accountId: a.id, accessTokenEnc: await sealForOrg(db, "org_del", "at"), refreshTokenEnc: await sealForOrg(db, "org_del", "rt-secret"), expiresAt: new Date(Date.now() + 3600_000) });
    const revokeGoogle = vi.fn(async () => true);
    expect(await deleteOrgMailboxes(db, "org_del", { revokeGoogle })).toBe(1);
    expect(revokeGoogle).toHaveBeenCalledWith("rt-secret");
    expect(await db.getAccount("g1")).toBeNull();
    expect((await db.listDeletionRecords("org_del"))[0]).toMatchObject({ reason: "org_deleted", revocation: "revoked" });
  });
});
