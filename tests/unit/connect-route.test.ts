import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupConnectLink } from "@/lib/connect/links";
import { HttpError } from "@/lib/http";
import { sha256 } from "@/lib/ids";
import { createMemoryDb } from "@/lib/db/memory";

const db = createMemoryDb("inboxwire");
let authed = true;
vi.mock("@/lib/db", () => ({ getDb: async () => db }));
vi.mock("@/lib/auth/session", () => ({
  authApiKey: async () => { if (!authed) throw new HttpError(401, "invalid_api_key"); return { orgId: "org_route", keyId: "k1" }; },
}));

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/connect-links", { method: "POST", headers: { "content-type": "application/json", "x-api-key": "k", ...headers }, body: JSON.stringify(body) });

describe("POST /v1/connect-links", () => {
  beforeEach(() => { authed = true; });

  it("needs an API key", async () => {
    authed = false;
    const { POST } = await import("@/app/api/v1/connect-links/route");
    expect((await POST(post({}), undefined as never)).status).toBe(401);
  });

  it("creates a 24 h single-use link in the key's org; reuse returns 410", async () => {
    const { POST } = await import("@/app/api/v1/connect-links/route");
    const res = await POST(post({ externalId: "user-1", redirectUrl: "https://app.example.com/done" }), undefined as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { url: string; token: string; expiresAt: string; environment: string };
    expect(body.url).toMatch(/\/connect\/cl_/);
    expect(body.environment).toBe("production");
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
    const link = await db.getConnectLink(await sha256(body.token));
    expect(link).toMatchObject({ externalId: "user-1" });
    expect((await db.getEnvironment(link!.envId))?.orgId).toBe("org_route");
    expect(await db.consumeConnectLink(link!.id, new Date())).toBe(true);
    expect(await lookupConnectLink(db, body.token)).toMatchObject({ ok: false, status: 410 });
  });

  it("honours x-environment and rejects bad redirect URLs and bad input", async () => {
    const { POST } = await import("@/app/api/v1/connect-links/route");
    const dev = await POST(post({}, { "x-environment": "development" }), undefined as never);
    expect(((await dev.json()) as { environment: string }).environment).toBe("development");
    expect((await POST(post({}, { "x-environment": "qa" }), undefined as never)).status).toBe(400);
    expect((await POST(post({ redirectUrl: "http://evil.example.com" }), undefined as never)).status).toBe(400);
    expect((await POST(post({ email: "nope" }), undefined as never)).status).toBe(400);
  });
});
