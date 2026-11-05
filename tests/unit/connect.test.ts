import { describe, expect, it, vi } from "vitest";
import { handleOAuthCallback } from "@/lib/connect/callback";
import { completeImap } from "@/lib/connect/complete";
import { assertLink, createConnectLink, CONNECT_LINK_TTL_MS, isSafeRedirect, lookupConnectLink } from "@/lib/connect/links";
import { buildAuthUrl, newOAuthState, pkcePair, redirectUri, validateClientCredentials } from "@/lib/connect/oauth";
import { discover } from "@/lib/connect/discover";
import { validatePubsub, wizardInfo } from "@/lib/connect/wizard";
import { HttpError } from "@/lib/http";
import { b64url, sha256 } from "@/lib/ids";
import { keyWrapper, openForOrg, sealForOrg } from "@/lib/secrets";
import { fakeImap, newDb, newLink, setupEnv } from "./m2-helpers";

describe("connect link lifecycle", () => {
  it("stores only the token hash", async () => {
    const db = newDb();
    const { token } = await newLink(db);
    expect(await db.getConnectLink(token)).toBeNull();
    expect((await db.getConnectLink(await sha256(token)))?.usedAt).toBeNull();
  });

  it("expires after 24 h with 410, unknown is 404", async () => {
    const db = newDb();
    const t0 = new Date("2026-11-05T10:00:00Z");
    const { env } = await setupEnv(db);
    const { token, expiresAt } = await createConnectLink(db, { envId: env.id, now: t0 });
    expect(expiresAt.getTime() - t0.getTime()).toBe(CONNECT_LINK_TTL_MS);
    expect((await lookupConnectLink(db, token, new Date(t0.getTime() + CONNECT_LINK_TTL_MS - 1))).ok).toBe(true);
    const late = await lookupConnectLink(db, token, new Date(t0.getTime() + CONNECT_LINK_TTL_MS));
    expect(late).toMatchObject({ ok: false, status: 410, reason: "expired" });
    expect(await lookupConnectLink(db, "cl_nope")).toMatchObject({ ok: false, status: 404 });
    expect(() => assertLink(late)).toThrow(HttpError);
  });

  it("is single use: the second consume fails and lookup returns 410", async () => {
    const db = newDb();
    const { token } = await newLink(db);
    const id = await sha256(token);
    const now = new Date();
    const results = await Promise.all([db.consumeConnectLink(id, now), db.consumeConnectLink(id, now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await lookupConnectLink(db, token)).toMatchObject({ ok: false, status: 410, reason: "used" });
  });

  it("rejects unsafe redirect URLs", async () => {
    expect(isSafeRedirect("https://app.example.com/done")).toBe(true);
    expect(isSafeRedirect("http://localhost:3000/x")).toBe(true);
    expect(isSafeRedirect("http://evil.example.com")).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
    const db = newDb();
    const { env } = await setupEnv(db);
    await expect(createConnectLink(db, { envId: env.id, redirectUrl: "javascript:alert(1)" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("IMAP connect", () => {
  const input = { email: "ana@example.test", imap: { host: "imap.example.test", port: 993, secure: true, user: "ana", pass: "s3cret-pass" } };

  it("wrong password gives 422 and does not burn the link", async () => {
    const db = newDb();
    const { token } = await newLink(db);
    const link = assertLink(await lookupConnectLink(db, token));
    const state = { uidValidity: 1, uidNext: 5, uids: [], connects: 0, failLogin: true };
    await expect(completeImap(db, link, input, { imapFactory: fakeImap(state) })).rejects.toMatchObject({ status: 422, code: "imap_verification_failed" });
    expect((await lookupConnectLink(db, token)).ok).toBe(true);
  });

  it("success creates the account, encrypts credentials, emits accountConnected, then the link is 410", async () => {
    const db = newDb();
    const { token, env } = await newLink(db, "org_1", { redirectUrl: "https://app.example.com/back", externalId: "user-42" });
    const link = assertLink(await lookupConnectLink(db, token));
    const emit = vi.fn(async () => {});
    const r = await completeImap(db, link, input, { imapFactory: fakeImap({ uidValidity: 1, uidNext: 5, uids: [], connects: 0 }), emit });
    expect(r.redirectUrl).toContain("account=");
    const [acct] = await db.listAccounts(env.id);
    expect(acct).toMatchObject({ externalId: "user-42", backend: "imap", mode: "polling", email: "ana@example.test" });
    const cred = await db.getCredentials(acct!.id);
    expect(cred?.imapSmtpEnc).toBeTruthy();
    expect(cred!.imapSmtpEnc).not.toContain("s3cret-pass");
    expect(JSON.parse(await openForOrg(db, "org_1", cred!.imapSmtpEnc!)).imap.pass).toBe("s3cret-pass");
    expect(emit).toHaveBeenCalledWith("org_1", "accountConnected", expect.objectContaining({ accountId: acct!.id }), { envId: acct!.envId });
    expect(await lookupConnectLink(db, token)).toMatchObject({ ok: false, status: 410 });
    await expect(completeImap(db, link, input, { imapFactory: fakeImap({ uidValidity: 1, uidNext: 5, uids: [], connects: 0 }), emit })).rejects.toMatchObject({ status: 410 });
  });
});

describe("credential encryption", () => {
  it("round trips, never stores plaintext, isolates orgs and detects tampering", async () => {
    const db = newDb();
    const blob = await sealForOrg(db, "org_a", "refresh-token-123");
    expect(blob).not.toContain("refresh-token-123");
    expect(await openForOrg(db, "org_a", blob)).toBe("refresh-token-123");
    await sealForOrg(db, "org_b", "x");
    await expect(openForOrg(db, "org_b", blob)).rejects.toThrow();
    const bad = Buffer.from(blob, "base64");
    bad[bad.length - 1] ^= 1;
    await expect(openForOrg(db, "org_a", bad.toString("base64"))).rejects.toThrow();
    // The data key is stored only wrapped.
    const key = await db.getOrgKey("org_a");
    expect(key?.wrappedDek).toBeTruthy();
    expect(keyWrapper().unwrap(Buffer.from(key!.wrappedDek, "base64"))).toHaveLength(32);
  });

  it("requires MASTER_KEY in production and a 32 byte key", async () => {
    const { masterKey } = await import("@/lib/secrets");
    expect(() => masterKey({ NODE_ENV: "production" })).toThrow(/MASTER_KEY/);
    expect(() => masterKey({ MASTER_KEY: Buffer.alloc(8).toString("base64") })).toThrow(/32 bytes/);
    expect(masterKey({ MASTER_KEY: Buffer.alloc(32, 1).toString("base64") })).toHaveLength(32);
  });
});

describe("OAuth state and PKCE", () => {
  it("challenge is base64url(sha256(verifier)) and the URL carries S256 + state", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(challenge).toBe(b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const { state, stateHash } = await newOAuthState();
    expect(stateHash).toBe(await sha256(state));
    const u = new URL(buildAuthUrl("google", { clientId: "cid", redirectUri: redirectUri("https://x.test/", "google"), state, challenge, loginHint: "a@b.test" }));
    expect(u.searchParams.get("code_challenge")).toBe(challenge);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(state);
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.test/api/connect/callback/google");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("gmail.modify");
    expect(new URL(buildAuthUrl("microsoft", { clientId: "c", redirectUri: "r", state, challenge })).searchParams.get("scope")).toContain("offline_access");
  });

  async function started(provider: "google" | "microsoft" = "google") {
    const db = newDb();
    const { token, env } = await newLink(db, "org_1", { externalId: "u1" });
    await db.upsertOAuthClient({ id: "oc1", envId: env.id, provider, clientId: "cid", clientSecretEnc: await sealForOrg(db, "org_1", "csecret-xx"), mode: "byo", pubsubTopic: null });
    const link = assertLink(await lookupConnectLink(db, token));
    const { state, stateHash } = await newOAuthState();
    const { verifier } = await pkcePair();
    await db.setConnectLinkOAuth(link.id, { stateHash, verifier, provider });
    return { db, state, verifier, env };
  }
  const idToken = (email: string) => `h.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.s`;
  const okFetch = (calls: { body?: string }[] = []) => (async (_url: unknown, init?: RequestInit) => {
    calls.push({ body: init?.body as string });
    return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, id_token: idToken("Ana@Gmail.com") }), { status: 200 });
  }) as unknown as typeof fetch;

  it("rejects unknown state, wrong provider and replay", async () => {
    const { db, state } = await started("google");
    const deps = { fetchFn: okFetch(), emit: async () => {} };
    await expect(handleOAuthCallback(db, "google", { code: "c", state: "bogus" }, "https://x.test", deps)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(handleOAuthCallback(db, "microsoft", { code: "c", state }, "https://x.test", deps)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(handleOAuthCallback(db, "google", { code: "c" }, "https://x.test", deps)).rejects.toMatchObject({ code: "missing_state" });
    await handleOAuthCallback(db, "google", { code: "c", state }, "https://x.test", deps);
    await expect(handleOAuthCallback(db, "google", { code: "c", state }, "https://x.test", deps)).rejects.toBeInstanceOf(HttpError);
  });

  it("exchanges the code with the stored PKCE verifier and stores encrypted tokens", async () => {
    const { db, state, verifier, env } = await started("google");
    const calls: { body?: string }[] = [];
    const r = await handleOAuthCallback(db, "google", { code: "auth-code", state }, "https://x.test", { fetchFn: okFetch(calls), emit: async () => {} });
    const sent = new URLSearchParams(calls[0]!.body);
    expect(sent.get("code_verifier")).toBe(verifier);
    expect(sent.get("client_secret")).toBe("csecret-xx");
    expect(sent.get("redirect_uri")).toBe("https://x.test/api/connect/callback/google");
    expect(r.email).toBe("ana@gmail.com");
    const [acct] = await db.listAccounts(env.id);
    expect(acct).toMatchObject({ backend: "gmail_api", externalId: "u1", mode: "polling" });
    const cred = await db.getCredentials(acct!.id);
    expect(cred!.accessTokenEnc).not.toBe("at");
    expect(await openForOrg(db, "org_1", cred!.refreshTokenEnc!)).toBe("rt");
  });

  it("a provider denial keeps the link usable but burns the state", async () => {
    const { db, state, env } = await started("google");
    await expect(handleOAuthCallback(db, "google", { error: "access_denied", state }, "https://x.test", {})).rejects.toMatchObject({ code: "oauth_denied" });
    expect(await db.listAccounts(env.id)).toHaveLength(0);
    await expect(handleOAuthCallback(db, "google", { code: "c", state }, "https://x.test", {})).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("maps a failed token exchange to 502", async () => {
    const { db, state } = await started("microsoft");
    const bad = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await expect(handleOAuthCallback(db, "microsoft", { code: "c", state }, "https://x.test", { fetchFn: bad })).rejects.toMatchObject({ status: 502 });
  });
});

describe("BYO wizard and discovery", () => {
  it("validates client ids and Pub/Sub fields", () => {
    expect(validateClientCredentials("google", "123-abc.apps.googleusercontent.com", "longenough")).toBeNull();
    expect(validateClientCredentials("google", "nope", "longenough")).toMatch(/googleusercontent/);
    expect(validateClientCredentials("microsoft", "00000000-0000-0000-0000-000000000000", "longenough")).toBeNull();
    expect(validateClientCredentials("microsoft", "abc", "longenough")).toMatch(/GUID/);
    expect(validateClientCredentials("microsoft", "00000000-0000-0000-0000-000000000000", "x")).toMatch(/short/);
    expect(validatePubsub("projects/my-proj-123/topics/inbox", "inboxwire-push@my-proj-123.iam.gserviceaccount.com")).toBeNull();
    expect(validatePubsub("bad", "x")).toMatch(/topic/);
    expect(validatePubsub("projects/my-proj-123/topics/inbox", null)).toMatch(/service account/);
  });

  it("shows exact redirect URIs, hook URLs and gcloud commands", () => {
    const i = wizardInfo("https://inboxwire.example/", "env_1");
    expect(i.google.redirectUri).toBe("https://inboxwire.example/api/connect/callback/google");
    expect(i.microsoft.redirectUri).toBe("https://inboxwire.example/api/connect/callback/microsoft");
    expect(i.google.hookUrl).toMatch(/^https:\/\/inboxwire\.example\/api\/hooks\/gmail\/env_1\?token=/);
    expect(i.google.gcloud.some((c) => c.includes("gmail-api-push@system.gserviceaccount.com"))).toBe(true);
    expect(i.microsoft.hookUrl).toBe("https://inboxwire.example/api/hooks/graph/env_1");
  });

  it("discovers providers from MX, SRV and static hints", async () => {
    const r = (mx: string[], srv: Record<string, { name: string; port: number }[]> = {}) => ({
      resolveMx: async () => mx.map((exchange, priority) => ({ exchange, priority })),
      resolveSrv: async (n: string) => { if (srv[n]) return srv[n]!; throw new Error("ENOTFOUND"); },
    });
    expect((await discover("a@corp.test", r(["aspmx.l.google.com."]))).provider).toBe("google");
    expect((await discover("a@corp.test", r(["corp-test.mail.protection.outlook.com"]))).provider).toBe("microsoft");
    expect((await discover("a@yahoo.com", r([]))).imap?.host).toBe("imap.mail.yahoo.com");
    expect((await discover("a@own.test", r(["mx.own.test"], { "_imaps._tcp.own.test": [{ name: "mail.own.test.", port: 993 }] }))).imap?.host).toBe("mail.own.test");
    expect((await discover("a@plain.test", r([]))).imap?.host).toBe("imap.plain.test");
  });
});
