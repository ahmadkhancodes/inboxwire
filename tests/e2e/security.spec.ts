// Adversarial review (docs/SECURITY-REVIEW.md): real attacks against the running app (memory DB, outbox mail).
// Two users in two organisations; every attempt uses the attacker's own session against the victim's ids.
import { expect, request as pwRequest, test, type APIRequestContext } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const n = () => Math.floor(Math.random() * 250);
const ip = () => `10.${n()}.${n()}.${n()}`;
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** A signed-in API client: magic link through the dev outbox, cookie kept in the context. */
async function user(email = uniq("u")): Promise<{ api: APIRequestContext; email: string }> {
  const api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE, "x-forwarded-for": ip() } });
  expect((await api.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" } })).status()).toBe(200);
  const box = await (await api.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1)?.text ?? "")?.[0];
  expect(link).toBeTruthy();
  const r = await api.get(link!, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  return { api, email };
}
async function org(api: APIRequestContext, name: string) {
  const r = await api.post("/api/auth/organization/create", { data: { name, slug: `${name.toLowerCase()}-${Date.now()}-${n()}` } });
  expect(r.status()).toBe(200);
  return (await r.json()) as { id: string };
}

test.describe("security review", () => {
  test("session cookie is HttpOnly + SameSite=Lax, and a used magic link cannot be replayed", async () => {
    const email = uniq("cookie");
    const api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE, "x-forwarded-for": ip() } });
    await api.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" } });
    const link = /https?:\/\/\S+magic-link\/verify\S+/.exec((await (await api.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages.at(-1).text)![0];
    const first = await api.get(link, { maxRedirects: 0 });
    const cookie = first.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value).find((v) => v.includes("session_token"))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const again = await (await pwRequest.newContext({ baseURL: BASE })).get(link, { maxRedirects: 0 });
    expect(again.headers().location).toContain("error=");
    expect(again.headersArray().some((h) => h.name.toLowerCase() === "set-cookie" && /session_token=[^;]+/.test(h.value) && !/Max-Age=0/i.test(h.value))).toBe(false);
  });

  test("SR-1: ?next= with a tab cannot bounce a signed-in user to another site", async () => {
    const { api } = await user();
    for (const next of ["/%09/evil.example", "/%0a/evil.example", "//evil.example", "/%5Cevil.example", "https://evil.example"]) {
      const r = await api.get(`/sign-in?next=${next}`, { maxRedirects: 0 });
      const loc = r.headers().location ?? "";
      expect(new URL(loc, BASE).origin, `next=${next} -> ${JSON.stringify(loc)}`).toBe(new URL(BASE).origin);
    }
  });

  test("SR-2: rotating IPs cannot flood one inbox with sign-in links", async () => {
    const victim = uniq("victim");
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE, "x-forwarded-for": ip() } });
      codes.push((await api.post("/api/auth/sign-in/magic-link", { data: { email: victim, callbackURL: "/app" } })).status());
    }
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  test("tenant isolation: the attacker's session cannot read, change or delete the victim's things", async () => {
    const a = await user(uniq("attacker"));
    const v = await user(uniq("victim"));
    await org(a.api, "Attacker");
    const ov = await org(v.api, "Victim");
    const wh = (await (await v.api.post("/api/webhooks", { data: { url: "https://example.com/hook" } })).json()) as { endpoint: { id: string } };
    const key = (await (await v.api.post("/api/auth/api-key/create", { data: { name: "victim key", organizationId: ov.id, metadata: { scopes: ["read"] } } })).json()) as { id: string };
    const seeded = (await (await v.api.post("/api/dev/seed")).json()) as { lines: string[] };
    const vDeliveries = (await (await v.api.get("/api/webhooks/deliveries")).json()) as { deliveries: { id: string }[] };
    expect(vDeliveries.deliveries.length).toBeGreaterThan(0);
    const did = vDeliveries.deliveries[0]!.id;

    const attempts: [string, string, unknown?][] = [
      ["GET", `/api/auth/organization/get-full-organization?organizationId=${ov.id}`],
      ["POST", "/api/auth/organization/set-active", { organizationId: ov.id }],
      ["POST", "/api/auth/organization/update", { organizationId: ov.id, data: { name: "pwned" } }],
      ["POST", "/api/auth/organization/delete", { organizationId: ov.id }],
      ["GET", `/api/auth/organization/list-members?organizationId=${ov.id}`],
      ["POST", "/api/auth/organization/invite-member", { organizationId: ov.id, email: uniq("x"), role: "owner" }],
      ["GET", `/api/auth/api-key/list?organizationId=${ov.id}`],
      ["GET", `/api/auth/api-key/get?id=${key.id}`],
      ["POST", "/api/auth/api-key/update", { keyId: key.id, metadata: { scopes: ["admin"] } }],
      ["POST", "/api/auth/api-key/delete", { keyId: key.id }],
      ["POST", "/api/auth/api-key/create", { name: "x", organizationId: ov.id }],
      ["PATCH", `/api/webhooks/${wh.endpoint.id}`, { enabled: false, url: "https://attacker.example/" }],
      ["DELETE", `/api/webhooks/${wh.endpoint.id}`],
      ["POST", `/api/webhooks/${wh.endpoint.id}/test`],
      ["POST", `/api/app/deliveries/${did}/replay`],
    ];
    for (const [method, path, data] of attempts) {
      const r = await a.api.fetch(path, { method, data });
      expect([400, 401, 403, 404], `${method} ${path} -> ${r.status()} ${await r.text()}`).toContain(r.status());
    }
    // lists scoped to the attacker's org show none of the victim's rows
    const leak = JSON.stringify(await Promise.all(["/api/webhooks", `/api/webhooks/deliveries?endpointId=${wh.endpoint.id}`, "/api/app/outbox", "/api/audit", "/api/app/live/snapshot"].map(async (p) => (await a.api.get(p)).text())));
    for (const id of [ov.id, wh.endpoint.id, did, ...seeded.lines]) expect(leak).not.toContain(id);
    // and the victim's things are untouched
    const mine = (await (await v.api.get("/api/webhooks")).json()) as { endpoints: { id: string; enabled: boolean; url: string }[] };
    expect(mine.endpoints.find((e) => e.id === wh.endpoint.id)).toMatchObject({ enabled: true, url: "https://example.com/hook" });
  });

  test("roles: a member cannot escalate, export the audit log or create environments; an admin can manage keys", async () => {
    const owner = await user(uniq("owner"));
    const member = await user(uniq("member"));
    const admin = await user(uniq("admin"));
    const o = await org(owner.api, "Roles");
    for (const [u, role] of [[member, "member"], [admin, "admin"]] as const) {
      const inv = (await (await owner.api.post("/api/auth/organization/invite-member", { data: { organizationId: o.id, email: u.email, role } })).json()) as { id: string };
      expect((await u.api.post("/api/auth/organization/accept-invitation", { data: { invitationId: inv.id } })).status()).toBe(200);
    }
    await owner.api.post("/api/webhooks", { data: { url: "https://example.com/audit-me" } }); // writes an audit entry
    const full = (await (await owner.api.get(`/api/auth/organization/get-full-organization?organizationId=${o.id}`)).json()) as { members: { id: string; user: { email: string } }[] };
    const memberId = full.members.find((m) => m.user.email === member.email)!.id;

    expect((await member.api.post("/api/auth/organization/update-member-role", { data: { memberId, role: "owner", organizationId: o.id } })).status()).toBe(403);
    expect((await member.api.post("/api/webhooks", { data: { url: "https://example.com/x" } })).status()).toBe(403);
    expect((await member.api.get("/api/audit")).status()).toBe(403);
    expect((await admin.api.post("/api/auth/organization/invite-member", { data: { organizationId: o.id, email: uniq("y"), role: "owner" } })).status()).toBe(403);

    // SR-4: the account export no longer hands a member the org's audit log or billing
    const exp = (await (await member.api.get("/api/account/export")).json()) as { organizations: { id: string; data: Record<string, unknown> }[] };
    const data = exp.organizations.find((x) => x.id === o.id)!.data;
    expect(data).not.toHaveProperty("auditLog");
    expect(data).toHaveProperty("webhookEndpoints"); // members may read endpoints and billing in the dashboard too
    const ownerExp = (await (await owner.api.get("/api/account/export")).json()) as { organizations: { id: string; data: { auditLog?: unknown[] } }[] };
    expect(ownerExp.organizations.find((x) => x.id === o.id)!.data.auditLog?.length).toBeGreaterThan(0);

    // SR-3: Free plan = one environment; the OAuth-client screen used to create staging/development for free
    expect((await member.api.get("/api/oauth-clients?environment=production")).status()).toBe(200);
    for (const e of ["staging", "development"]) {
      const r = await member.api.get(`/api/oauth-clients?environment=${e}`);
      expect(r.status()).toBe(402);
      expect(await r.json()).toMatchObject({ error: "environment_limit" });
    }

    // SR-8: admins hold apiKey "manage" in our table but the plugin asked for "create" and refused them
    const k = await admin.api.post("/api/auth/api-key/create", { data: { name: "admin key", organizationId: o.id, metadata: { scopes: ["read"] } } });
    expect(k.status(), await k.text()).toBe(200);
    expect((await member.api.post("/api/auth/api-key/create", { data: { name: "member key", organizationId: o.id } })).status()).toBe(403);
  });

  test("SR-6: deleting another org's webhook answers 404, not 200", async () => {
    const a = await user();
    const v = await user();
    await org(a.api, "A");
    await org(v.api, "V");
    const wh = (await (await v.api.post("/api/webhooks", { data: { url: "https://example.com/h" } })).json()) as { endpoint: { id: string } };
    expect((await a.api.delete(`/api/webhooks/${wh.endpoint.id}`)).status()).toBe(404);
  });

  test("CSRF: cookie requests from another origin are refused; NoSQL operators are rejected by validation", async () => {
    const { api } = await user();
    await org(api, "Csrf");
    expect((await api.post("/api/webhooks", { data: { url: "https://example.com/x" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
    expect((await api.post("/api/webhooks", { data: { url: "https://example.com/x" }, headers: { origin: "" } })).status()).toBe(403);
    expect((await api.post("/api/webhooks", { data: { url: { $ne: null } } })).status()).toBe(400);
    expect((await api.post("/api/billing/checkout", { data: { plan: "growth", interval: "month", price: "price_free" } })).status()).not.toBe(200);
    const r = await api.post("/api/connect/x/discover", { data: { email: { $gt: "" } } });
    expect([400, 404, 410]).toContain(r.status());
  });

  test("SR-5 and errors: oversized hook bodies are refused, errors carry no internals, private hosts are not webhook targets", async ({ request }) => {
    const big = "x".repeat(300_000);
    const r = await request.post("/api/hooks/graph/some-env", { data: `{"value":"${big}"}`, headers: { "content-type": "application/json" } });
    expect(r.status()).toBe(413);
    const bad = await request.post("/api/hooks/gmail/x", { data: "{not json", headers: { "content-type": "application/json" } });
    expect(await bad.text()).not.toMatch(/at \w+ \(|node_modules|\/src\//);
    const { api } = await user();
    await org(api, "Ssrf");
    for (const url of ["https://127.0.0.1/", "https://169.254.169.254/latest", "https://10.0.0.5/", "https://mongo:27017/", "https://[::1]/", "http://example.com/", "https://user:pw@example.com/"]) {
      expect((await api.post("/api/webhooks", { data: { url } })).status(), url).toBe(400);
    }
    const h = await request.get("/api/health");
    expect(Object.keys(await h.json()).sort()).toEqual(["at", "db", "ok", "services", "status", "version"]);
    expect((await request.get("/metrics")).status()).toBe(404);
    expect((await request.get("/api/admin/overview")).status()).toBe(401);
    expect((await request.get("/api/cron/purge", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  });
});
