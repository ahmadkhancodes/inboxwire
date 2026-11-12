import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planById, product } from "@/config/product";
import { docs } from "@/content/docs";
import { isSandboxAccount, sandboxBackend, SANDBOX_PREFIX } from "@/lib/backends/sandbox";
import { LIMIT_NOTICE_WINDOW_MS, mailboxLimitEmail, notifyMailboxLimit, upgradeTarget } from "@/lib/billing/limit-notice";
import { createMemoryDb } from "@/lib/db/memory";
import { operationCurl, PLACEHOLDER_IDS } from "@/lib/docs-curl";
import type { MailTransport } from "@/lib/mail/types";
import { onboardingFacts, onboardingSteps } from "@/lib/onboarding";
import { operations } from "@/lib/openapi";
import { firstCallSnippet, homeConnectCurl } from "@/lib/snippets";

describe("first-call snippet shown with a new API key", () => {
  it("admin keys get a connect-link command with the real key and URL", () => {
    const s = firstCallSnippet("https://inboxwire.buffersoltech.com/", "iw_live_abc", ["read", "send", "admin"]);
    expect(s.code).toContain("curl -X POST https://inboxwire.buffersoltech.com/v1/connect-links");
    expect(s.code).toContain("'Authorization: Bearer iw_live_abc'");
    expect(s.code).toContain(`'{"externalId":"user_42"}'`);
  });
  it("read and send keys get a call they are allowed to make, and say what needs admin", () => {
    const r = firstCallSnippet("http://localhost:3100", "k", ["read"]);
    expect(r.code).toBe("curl http://localhost:3100/v1/accounts \\\n  -H 'Authorization: Bearer k'");
    expect(r.note).toMatch(/can read\. .*admin key/);
    expect(firstCallSnippet("http://x", "k", ["read", "send"]).note).toContain("read and send");
  });
  it("a quote in a key cannot break out of the shell argument", () => {
    expect(firstCallSnippet("http://x", "a'b", ["read"]).code).toContain(`'Authorization: Bearer a'\\''b'`);
  });
});

describe("home page connect-link example", () => {
  it("uses the real request fields and response fields of POST /v1/connect-links", () => {
    const c = homeConnectCurl("https://inboxwire.buffersoltech.com");
    expect(c).toContain('"externalId"');
    expect(c).toContain('"redirectUrl"');
    expect(c).toContain("Content-Type: application/json");
    expect(c).toContain('"expiresAt"');
    expect(c).not.toMatch(/"account"|"redirect"|expiresIn/);
  });
});

describe("overview checklist reflects real progress", () => {
  it("counts done steps and points at the first open one", () => {
    expect(onboardingSteps({ keys: 0, endpoints: 0, lines: 0, deliveries: 0 })).toMatchObject({ doneCount: 0, total: 4, next: "key" });
    const mid = onboardingSteps({ keys: 1, endpoints: 0, lines: 2, deliveries: 0 });
    expect(mid.doneCount).toBe(2);
    expect(mid.next).toBe("webhook");
    expect(mid.steps.map((s) => s.done)).toEqual([true, false, true, false]);
    expect(onboardingSteps({ keys: 1, endpoints: 1, lines: 1, deliveries: 1 }).next).toBeNull();
  });
  it("reads endpoints, lines and deliveries from the database", async () => {
    const db = createMemoryDb("inboxwire");
    expect(await onboardingFacts(db, "org_o", 0)).toEqual({ keys: 0, endpoints: 0, lines: 0, deliveries: 0 });
    const env = await db.ensureEnvironment("org_o", "production");
    await db.upsertAccount({ id: "a1", envId: env.id, externalId: "x", email: "a@x.test", provider: "imap", backend: "imap", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
    await db.createWebhookEndpoint({ id: "w1", orgId: "org_o", url: "https://example.com/h", secret: "whsec_x", events: ["messageNew"], enabled: true, envId: env.id });
    expect(await onboardingFacts(db, "org_o", 2)).toEqual({ keys: 2, endpoints: 1, lines: 1, deliveries: 0 });
  });
});

describe("mailbox-limit notice to the owners", () => {
  it("suggests the next hosted plan with more mailboxes", () => {
    expect(upgradeTarget("free")?.id).toBe("starter");
    expect(upgradeTarget("starter")?.id).toBe("growth");
    expect(upgradeTarget("growth")).toBeNull();
  });
  it("says what happened, what to do, and deep-links to the plan", () => {
    const g = planById("growth")!;
    const m = mailboxLimitEmail({ planName: "Cloud Starter", limit: 25, target: { id: "growth", name: g.name, mailboxes: g.limits.mailboxes }, base: "https://app.test" });
    expect(m.subject).toBe("A mailbox connection was refused: Cloud Starter allows 25");
    expect(m.text).toContain("https://app.test/app/billing?plan=growth");
    expect(m.text).toContain(`$${(product.extraMailbox.usd / 100).toFixed(2)} a month`);
    expect(m.text).toContain("send them a new connect link");
  });
  it("is sent to every owner at most once a day per organisation", async () => {
    const db = createMemoryDb("inboxwire");
    const sent: string[] = [];
    const transport: MailTransport = { name: "test", send: async (msg) => { sent.push(`${msg.to}|${msg.subject}`); return { id: "m", provider: "test", accepted: true }; } };
    const owners = async () => ["clara@northwind.test", "cto@northwind.test"];
    const now = 1_800_000_000_000;
    expect(await notifyMailboxLimit(db, "org_l", "free", 3, { owners, transport, now })).toBe(2);
    expect(await notifyMailboxLimit(db, "org_l", "free", 3, { owners, transport, now: now + 60_000 })).toBe(0);
    expect(await notifyMailboxLimit(db, "org_other", "free", 3, { owners, transport, now })).toBe(2);
    expect(await notifyMailboxLimit(db, "org_l", "free", 3, { owners, transport, now: now + LIMIT_NOTICE_WINDOW_MS + 1 })).toBe(2);
    expect(sent[0]).toBe("clara@northwind.test|A mailbox connection was refused: Developer allows 3");
  });
  it("never throws, even when the owner lookup fails", async () => {
    const db = createMemoryDb("inboxwire");
    await expect(notifyMailboxLimit(db, "org_x", "free", 3, { owners: async () => { throw new Error("db down"); } })).resolves.toBe(0);
  });
});

describe("sandbox mailbox (docs-run e2e stand-in)", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("is only reachable with E2E_OUTBOX=1 and the sandbox externalId prefix", () => {
    vi.stubEnv("E2E_OUTBOX", "");
    expect(isSandboxAccount(`${SANDBOX_PREFIX}user_42`)).toBe(false);
    vi.stubEnv("E2E_OUTBOX", "1");
    expect(isSandboxAccount(`${SANDBOX_PREFIX}user_42`)).toBe(true);
    expect(isSandboxAccount("user_42")).toBe(false);
    expect(isSandboxAccount(null)).toBe(false);
  });
  it("answers the unified search syntax used in the quickstart", async () => {
    const b = sandboxBackend();
    expect((await b.listMessages({ q: "from:billing@example.com has:attachment" })).items.map((m) => m.id)).toEqual(["sbx_3"]);
    expect((await b.listMessages({ q: "after:2026-11-01", limit: 20 })).items).toHaveLength(2);
    await expect(b.getMessage("nope", "json")).rejects.toThrow("not_found");
  });
});

describe("docs point at screens that exist", () => {
  it("no doc sends people to the old Settings paths", () => {
    const text = JSON.stringify(docs);
    expect(text).not.toMatch(/Settings, then (API keys|Billing|Webhooks|Account|Security)/);
    const nav = readFileSync("src/components/app/app-shell.tsx", "utf8");
    for (const label of ["Keys", "Webhooks", "Billing", "Security", "Profile", "Lines"]) expect(nav).toContain(`label: "${label}"`);
  });
  it("/docs/api placeholder ids name the right resource", () => {
    const op = (id: string) => operations.find((o) => o.id === id)!;
    expect(operationCurl(op("getWebhook"), "https://x")).toContain(`/v1/webhooks/${PLACEHOLDER_IDS.webhook}`);
    expect(operationCurl(op("getOutboxItem"), "https://x")).toContain(`/v1/outbox/${PLACEHOLDER_IDS.outbox}`);
    expect(operationCurl(op("getAttachment"), "https://x")).toContain(`/v1/accounts/acc_123/messages/msg_456/attachments/att_789`);
  });
});

describe("price claims in public copy match the code", () => {
  it("home page and product description use the real plan numbers", () => {
    const home = readFileSync("src/app/(marketing)/page.tsx", "utf8");
    const selfhostYear = planById("selfhost")!.prices.find((p) => p.interval === "year")!.usd / 100;
    const starterMonth = planById("starter")!.prices.find((p) => p.interval === "month")!.usd / 100;
    expect(home).toContain(`Developer tier is free for ${planById("free")!.limits.mailboxes} mailboxes`);
    expect(home).toContain(`running it on your servers is $${selfhostYear} a year`);
    expect(home).toContain(`Cloud extras are $${(product.extraMailbox.usd / 100).toFixed(2)} each`);
    expect(product.description).toContain(`$${selfhostYear} a year`);
    expect(product.description).toContain(`$${starterMonth} a month`);
  });
});
