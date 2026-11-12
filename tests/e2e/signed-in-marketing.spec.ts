import { expect, test } from "@playwright/test";
import { uiSignIn } from "./qa/helpers";

const header = (page: import("@playwright/test").Page) => page.locator("header").first();

test("signed-out marketing pages show Sign in and signup CTAs", async ({ page }) => {
  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    await expect(header(page).getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(header(page).getByRole("link", { name: "Start free" })).toBeVisible();
    await expect(header(page).getByRole("link", { name: "Open dashboard" })).toHaveCount(0);
  }
  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible();
});

test("signed-in visitors get Open dashboard and no signup CTAs", async ({ page }) => {
  const link = await uiSignIn(page, `mk-${Date.now()}@example.com`);
  await page.goto(link);
  await page.waitForURL(/\/(app|onboarding)/);

  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    await expect(header(page).getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/app");
    await expect(header(page).getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await expect(header(page).getByRole("link", { name: "Start free" })).toHaveCount(0);
  }

  await page.goto("/pricing");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "Start free" })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Open dashboard" }).first()).toHaveAttribute("href", "/app");
  await expect(main.locator('a[href^="/app/billing?plan=starter"]')).toBeVisible();

  await page.goto("/");
  await expect(page.locator("main").getByRole("link", { name: "Start free" })).toHaveCount(0);
});
