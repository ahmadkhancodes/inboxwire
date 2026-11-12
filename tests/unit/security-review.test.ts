// Exploit-style regressions for docs/SECURITY-REVIEW.md (12 Nov 2026). Each test is the attack; it failed before the fix.
import { describe, expect, it } from "vitest";
import { afterSignIn, safeNext } from "@/components/app/redirect";
import { can } from "@/lib/auth/roles";
import { NONE } from "@/lib/billing/entitlement";
import { environmentWithinPlan } from "@/lib/connect/env";
import { createMemoryDb } from "@/lib/db/memory";
import type { Entitlement } from "@/lib/db/types";
import { clientIp, HttpError, readBodyText, readJson } from "@/lib/http";
import { guardAuthMail } from "@/lib/security/auth-guard";

const paid = (plan: Entitlement["plan"]): Entitlement => ({ ...NONE(Date.now()), isPaid: true, status: "active", plan, interval: "month", expiresAt: Date.now() + 20 * 864e5, subscriptionId: "sub_1" });

describe("SR-1 open redirect through ?next= (control characters)", () => {
  // The browser's URL parser strips tab/CR/LF, so these all become //evil.example
  const attacks = ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/%09/evil.example".replace("%09", "\t"), "/\u0000/evil.example", "//evil.example", "/\\evil.example", "https://evil.example"];
  it.each(attacks)("refuses %j", (next) => {
    expect(safeNext(next)).toBe("/app");
    expect(afterSignIn({ next })).toBe("/app");
  });
  it("whatever it returns stays on our origin when a browser resolves it", () => {
    for (const next of attacks) expect(new URL(safeNext(next), "https://inboxwire.test").origin).toBe("https://inboxwire.test");
  });
  it("normal paths still work", () => {
    expect(safeNext("/app/billing?plan=growth&interval=year")).toBe("/app/billing?plan=growth&interval=year");
    expect(safeNext("/onboarding?next=%2Fapp")).toBe("/onboarding?next=%2Fapp");
  });
});

describe("SR-2 sign-in link and invite flooding", () => {
  const send = (email: string, ip: string, path = "/api/auth/sign-in/magic-link") =>
    new Request(`https://app.test${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email, callbackURL: "/app" }) });
  it("one victim address is capped no matter how many IPs the attacker rotates", async () => {
    const db = createMemoryDb("t");
    const results: (Response | null)[] = [];
    for (let i = 0; i < 8; i++) results.push(await guardAuthMail(send("Victim@Example.com ", `203.0.113.${i}`), db));
    expect(results.slice(0, 5).every((r) => r === null)).toBe(true);
    expect(results[5]?.status).toBe(429);
    expect(await results[5]!.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
  it("invitations to the same address share the budget", async () => {
    const db = createMemoryDb("t");
    for (let i = 0; i < 5; i++) expect(await guardAuthMail(send("v@example.com", `198.51.100.${i}`), db)).toBeNull();
    expect((await guardAuthMail(send("v@example.com", "198.51.100.99", "/api/auth/organization/invite-member"), db))?.status).toBe(429);
  });
  it("one IP cannot spray many addresses", async () => {
    const db = createMemoryDb("t");
    const r: (Response | null)[] = [];
    for (let i = 0; i < 21; i++) r.push(await guardAuthMail(send(`u${i}@example.com`, "192.0.2.7"), db));
    expect(r.slice(0, 20).every((x) => x === null)).toBe(true);
    expect(r[20]?.status).toBe(429);
  });
  it("leaves the body readable for Better Auth and ignores other paths", async () => {
    const db = createMemoryDb("t");
    const req = send("a@example.com", "192.0.2.1");
    expect(await guardAuthMail(req, db)).toBeNull();
    expect(await req.json()).toMatchObject({ email: "a@example.com" });
    expect(await guardAuthMail(send("a@example.com", "192.0.2.1", "/api/auth/get-session"), db)).toBeNull();
  });
});

describe("SR-3 free extra environments through /api/oauth-clients", () => {
  it("a Free org at its one environment cannot create staging or development", async () => {
    const db = createMemoryDb("t");
    await environmentWithinPlan(db, "org_free", "production");
    await expect(environmentWithinPlan(db, "org_free", "staging")).rejects.toMatchObject({ status: 402, code: "environment_limit" });
    expect((await db.listEnvironments("org_free")).map((e) => e.name)).toEqual(["production"]);
    // the existing one stays reachable
    expect((await environmentWithinPlan(db, "org_free", "production")).name).toBe("production");
  });
  it("a Growth org gets its three", async () => {
    const db = createMemoryDb("t");
    await db.setEntitlement("org_g", paid("growth"));
    for (const n of ["production", "staging", "development"] as const) await environmentWithinPlan(db, "org_g", n);
    expect(await db.listEnvironments("org_g")).toHaveLength(3);
  });
  it("the dashboard route goes through the plan check", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/api/oauth-clients/route.ts", "utf8");
    expect(src).not.toMatch(/db\.ensureEnvironment\(/);
    expect(src.match(/environmentWithinPlan\(/g)?.length).toBe(3);
  });
});

describe("SR-5 request bodies are capped while streaming", () => {
  const chunked = (bytes: number) => {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= bytes) return c.close();
        const n = Math.min(64_000, bytes - sent);
        sent += n;
        c.enqueue(new Uint8Array(n).fill(0x20));
      },
    });
    return new Request("https://app.test/x", { method: "POST", body, duplex: "half" } as RequestInit);
  };
  it("a 5 MB chunked body without Content-Length is refused with 413", async () => {
    await expect(readBodyText(chunked(5_000_000))).rejects.toMatchObject({ status: 413 });
    await expect(readJson(chunked(5_000_000))).rejects.toBeInstanceOf(HttpError);
  });
  it("small bodies pass", async () => {
    expect(await readJson(new Request("https://app.test/x", { method: "POST", body: '{"a":1}' }))).toEqual({ a: 1 });
  });
});

describe("SR-7 client IP is the hop our proxy added, not the one the client typed", () => {
  it("takes the rightmost X-Forwarded-For entry", () => {
    const req = new Request("https://app.test/x", { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" } });
    expect(clientIp(req)).toBe("203.0.113.9");
    expect(clientIp(new Request("https://app.test/x", { headers: { "x-forwarded-for": "198.51.100.1" } }))).toBe("198.51.100.1");
  });
});

describe("SR-8 role table matches the API-key plugin's action names", () => {
  it("owners and admins can create/revoke keys; members and viewers cannot", () => {
    for (const a of ["create", "update", "delete"]) {
      expect(can("owner", "apiKey", a)).toBe(true);
      expect(can("admin", "apiKey", a)).toBe(true);
      expect(can("member", "apiKey", a)).toBe(false);
      expect(can("viewer", "apiKey", a)).toBe(false);
    }
  });
});
