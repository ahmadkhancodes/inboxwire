import { describe, expect, it, vi } from "vitest";
import { scrub } from "@/lib/logger";
import { providerReason } from "@/lib/v1/handler";
import { csvCell, deliveriesCsv } from "@/lib/webhooks/csv";
import { checkHealth } from "@/lib/ops/health";
import { emailDigest } from "@/lib/accounts/deletion";

describe("log scrubbing", () => {
  it("redacts secret-looking keys anywhere in the name, nested, and e-mail addresses in values", () => {
    const o = scrub({ code: "x", userEmail: "a@b.co", accessToken: "t", stripeSignature: "s", err: "failed for bob@corp.test now", nested: { password: "p", ok: 1 } });
    expect(o.code).toBe("x");
    expect(o.userEmail).toBe("[redacted]");
    expect(o.accessToken).toBe("[redacted]");
    expect(o.stripeSignature).toBe("[redacted]");
    expect(o.err).toBe("failed for [email] now");
    expect(o.nested).toEqual({ password: "[redacted]", ok: 1 });
  });
});

describe("provider errors", () => {
  it("map to a code and never echo the provider text", () => {
    expect(providerReason("Invalid login: 535 5.7.8 user bob@corp.test")).toBe("authentication");
    expect(providerReason("getaddrinfo ENOTFOUND mail.internal.corp")).toBe("connection");
    expect(providerReason("429 quota exceeded")).toBe("rate_limited");
    expect(providerReason("request timed out")).toBe("timeout");
    expect(providerReason("something odd with secret=abc")).toBe("unknown");
  });
});

describe("deletion record digest", () => {
  it("is keyed, case-insensitive and not the plain sha256", () => {
    const k1 = Buffer.alloc(32, 1), k2 = Buffer.alloc(32, 2);
    expect(emailDigest("Me@X.test", k1)).toBe(emailDigest(" me@x.test ", k1));
    expect(emailDigest("me@x.test", k1)).not.toBe(emailDigest("me@x.test", k2));
  });
});

describe("health", () => {
  it("reports the database as up and leaks no details", async () => {
    const h = await checkHealth();
    expect(h.ok).toBe(true);
    expect(h.db.state).toBe("up");
    expect(JSON.stringify(h)).not.toMatch(/mongodb|password|secret|sk_/i);
  });
  it("reports down (not a throw) when the probe fails or hangs", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ getDb: async () => ({ getUsage: () => Promise.reject(new Error("mongodb://user:pw@host down")) }) }));
    const { checkHealth: ch } = await import("@/lib/ops/health");
    const h = await ch();
    expect(h.ok).toBe(false);
    expect(h.status).toBe("degraded");
    expect(JSON.stringify(h)).not.toMatch(/pw@host/);
    vi.doUnmock("@/lib/db");
  });
});

describe("deliveries CSV export", () => {
  it("quotes, escapes and neutralises spreadsheet formulas", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell(null)).toBe("");
    const csv = deliveriesCsv([{ id: "d1", event: "messageNew", status: "failed", attempts: 3, lastError: "+cmd|calc", createdAt: new Date("2026-01-01T00:00:00Z") }]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toMatch(/^id,eventId,event,status/);
    expect(lines[1]).toContain("'+cmd|calc");
    expect(lines[1]).toContain("2026-01-01T00:00:00.000Z");
  });
});
