import { expect, test } from "@playwright/test";

test("health reports real dependency state without leaking details", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  const b = await r.json();
  expect(b.ok).toBe(true);
  expect(b.db.state).toBe("up");
  expect(JSON.stringify(b)).not.toMatch(/mongodb|password|secret|sk_/i);
  expect((await request.get("/api/health?strict=1")).status()).toBe(200);
});

test("deliveries CSV export needs a session", async ({ request }) => {
  const r = await request.get("/api/webhooks/deliveries?format=csv", { maxRedirects: 0 });
  expect([401, 403]).toContain(r.status());
});
