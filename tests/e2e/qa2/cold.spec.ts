import { expect, test } from "@playwright/test";
import { watch } from "../qa/helpers";

// Replaces the "known open" React #418 tolerance: the first /sign-in hydration must be clean (dark mode, which mutated <html>, is gone).
test("first /sign-in load hydrates without React errors, in three fresh browser contexts", async ({ browser }) => {
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const problems = watch(page);
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Email")).toBeVisible();
    expect(problems, `load ${i}`).toEqual([]);
    await ctx.close();
  }
});
