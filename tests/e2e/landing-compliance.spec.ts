import { expect, test } from "@playwright/test";

// Landing page library audit (12 Nov 2026): measured in a real browser.
const SCALE = new Set(["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px", "48px", "60px", "72px", "96px", "128px"]);

for (const width of [390, 1440]) {
  test.describe(`home at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 800 ? 844 : 900 } });

    test("hero heading and subheading fit 680px, sizes on the scale, no overflow", async ({ page }) => {
      await page.goto("/");
      const m = await page.evaluate(() => {
        const h1 = document.querySelector("h1")!;
        const sub = h1.closest("section")!.querySelector("p.max-w-hero")!;
        const sizes = new Set<string>();
        for (const el of document.querySelectorAll("body *")) {
          if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) sizes.add(getComputedStyle(el).fontSize);
        }
        return {
          h1: h1.getBoundingClientRect().width, sub: sub.getBoundingClientRect().width, text: h1.textContent,
          sizes: [...sizes], overflow: document.documentElement.scrollWidth - window.innerWidth,
          weights: [...document.querySelectorAll("body *")].map((e) => Number(getComputedStyle(e).fontWeight)).filter((w) => w > 700).length,
        };
      });
      expect(m.h1).toBeLessThanOrEqual(680);
      expect(m.sub).toBeLessThanOrEqual(680);
      expect(m.text).toContain("send from your users");
      expect(m.sizes.filter((s) => !SCALE.has(s))).toEqual([]);
      expect(m.weights).toBe(0);
      expect(m.overflow).toBe(0);
    });
  });
}

test("one call to action above the fold", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const ctas = await page.evaluate(() =>
    [...document.querySelectorAll("main a")].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    }).map((a) => a.textContent?.trim()),
  );
  expect(ctas).toEqual(["Start free"]);
});

test("visible copy has no hyphens outside code and sample data", async ({ page }) => {
  await page.goto("/");
  const words = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const el = n.parentElement!;
      if (el.closest("pre, code, .font-mono, script, [aria-hidden=true], .sr-only")) continue;
      for (const w of n.textContent!.split(/\s+/)) if (/[A-Za-z]-[A-Za-z]/.test(w)) out.push(w);
    }
    return out;
  });
  // Plan name and an HTTP header are identifiers, not prose.
  expect(words.filter((w) => !/^(Self-host|Idempotency-Key)$/.test(w))).toEqual([]);
});

test.describe("tagline reveal", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("words turn on one by one while scrolling", async ({ page }) => {
    await page.goto("/");
    const words = page.locator("#tagline-title ~ p .kit-word");
    const n = await words.count();
    expect(n).toBeGreaterThan(10);
    const opacities = () => words.evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
    expect((await opacities()).every((o) => o >= 0.25 && o <= 0.35)).toBe(true);

    // Put the paragraph's middle on the trigger line (60% of the viewport): first words on, last words still muted.
    await page.evaluate(() => {
      const p = document.querySelector("#tagline-title ~ p")!;
      const r = p.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - window.innerHeight * 0.6);
    });
    await page.waitForTimeout(700);
    const mid = await opacities();
    expect(mid[0]).toBe(1);
    expect(mid[n - 1]).toBeLessThan(0.4);

    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(700);
    expect((await opacities()).every((o) => o === 1)).toBe(true);
  });

  test("reduced motion shows the final colour at once", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto("/");
    const o = await page.locator("#tagline-title ~ p .kit-word").evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
    expect(o.every((x) => x === "1")).toBe(true);
    await ctx.close();
  });
});

test("mobile menu is a full height panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const box = await page.locator("#mobile-menu").boundingBox();
  expect(box?.height).toBe(844);
  await expect(page.locator("#mobile-menu").getByRole("link", { name: "Pricing" })).toBeVisible();
});
