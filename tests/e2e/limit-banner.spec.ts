import { expect, test } from "@playwright/test";
import { uiSignIn } from "./qa/helpers";

test("a brand new free user sees no red limit banner on the first screen", async ({ page }) => {
  const link = await uiSignIn(page, `lim-${Date.now()}@example.com`);
  await page.goto(link);
  await page.waitForURL(/\/(app|onboarding)/);
  await page.goto("/app");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText("You are over your limit")).toHaveCount(0);
  await expect(page.locator('[role="alert"]').filter({ hasText: /limit/i })).toHaveCount(0);
  // Using the one included environment is a calm notice at most.
  const calm = page.getByText(/You are using all 1 environment/);
  if (await calm.count()) await expect(page.locator('[role="status"]').filter({ hasText: /Upgrade when you need more/ }).first()).toBeVisible();
});
