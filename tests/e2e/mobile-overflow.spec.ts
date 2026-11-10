import { expect, test } from "@playwright/test";
import { comparisons } from "../../src/content/compare";
import { docs } from "../../src/content/docs";

const paths = ["/docs", "/docs/api", "/compare", ...docs.map((d) => `/docs/${d.slug}`), ...comparisons.map((c) => `/compare/${c.slug}`)];

test.use({ viewport: { width: 375, height: 812 } });

for (const path of [...new Set(paths)]) {
  test(`no horizontal page scroll at 375px: ${path}`, async ({ page }) => {
    await page.goto(path);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
  });
}

test("long URL in inline code wraps instead of overflowing at 375px", async ({ page }) => {
  await page.goto("/docs/api");
  await page.evaluate(() => {
    const code = [...document.querySelectorAll("p.body-3 code")].find((c) => c.closest("p")?.textContent?.includes("Base URL"));
    if (!code) throw new Error("base URL paragraph not found");
    code.textContent = "https://inboxwire.buffersoltech.com/v1";
  });
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(inner);
});
