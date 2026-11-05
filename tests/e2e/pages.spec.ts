import { expect, test } from "@playwright/test";

test("landing -> pricing -> sign-in renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("one API");
  await page.getByRole("link", { name: "Pricing" }).first().click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { name: "Same core features. About half the price." })).toBeVisible();
  await page.getByRole("link", { name: "Start free" }).first().click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("pricing slider shows our bill from product.ts and the dated comparison", async ({ page }) => {
  await page.goto("/pricing");
  const count = page.getByLabel("How many mailboxes will you connect?");
  await count.fill("100");
  await expect(page.getByText("Monthly bill for 100 mailboxes")).toBeVisible();
  await expect(page.getByText("$99.99").first()).toBeVisible();
  await count.fill("120");
  await expect(page.getByText("Cloud Growth + 20 extra")).toBeVisible();
  await expect(page.getByText("$119.79")).toBeVisible();
  await expect(page.getByText(/read 3 Nov 2026/).first()).toBeVisible();
});

test("/status renders lamp rows and the 90 day strip", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByRole("heading", { level: 1, name: "Status" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "REST API" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Database" })).toBeVisible();
  await expect(page.getByRole("img", { name: /REST API, last 90 days/ })).toBeVisible();
});

test("/casa calculator reacts to answers", async ({ page }) => {
  await page.goto("/casa");
  await expect(page.getByText("Likely yes: restricted scopes with a server")).toBeVisible();
  await page.getByLabel("Only people in your own Workspace organisation connect").check();
  await expect(page.getByText("Probably no assessment: internal Workspace app")).toBeVisible();
});

test("uptime-probe cron job is registered and guarded", async ({ request }) => {
  expect((await request.post("/api/cron/uptime-probe")).status()).toBe(401);
  const ok = await request.post("/api/cron/uptime-probe", { headers: { authorization: "Bearer e2e-cron" } });
  expect(ok.status()).toBe(200);
});
