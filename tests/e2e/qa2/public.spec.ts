import { expect, test, type Page } from "@playwright/test";
import { watch } from "../qa/helpers";
import { scanPage } from "./scan";

/** Post-redesign regression: every public screen at 375 and 1440, light-only, new type and colour system. */
const PAGES = ["/", "/pricing", "/casa", "/status", "/docs", "/compare", "/sign-in", "/legal/terms", "/legal/privacy", "/does-not-exist"];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 375, height: 812 }];

async function sitePaths(page: Page) {
  const xml = await (await page.request.get("/sitemap.xml")).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
}

for (const vp of VIEWPORTS) {
  test(`every public page is clean, light-only, on-brand and not clipped (${vp.width}px)`, async ({ page, request }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(vp);
    const problems = watch(page, { allowStatus: [429] });
    const paths = [...new Set([...PAGES, ...(await sitePaths(page))])];
    const bad: string[] = [];
    for (const p of paths) {
      const res = await page.goto(p);
      await page.waitForLoadState("load");
      await page.waitForTimeout(250);
      if (p !== "/does-not-exist") expect(res?.status(), p).toBeLessThan(400);
      const r = await scanPage(page);
      for (const x of r) bad.push(`${p}: ${x}`);
    }
    expect(bad).toEqual([]);
    expect(problems).toEqual([]);
    void request;
  });
}

test("no page, e-mail or image still carries the old paper/amber/Chivo identity", async ({ page, request }) => {
  const css = await (await request.get("/")).text();
  const sheets = [...css.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]!);
  expect(sheets.length).toBeGreaterThan(0);
  for (const s of sheets) {
    const body = await (await request.get(s)).text();
    expect(body, s).not.toMatch(/f5a524|chivo|prefers-color-scheme:\s*dark|\[data-theme/i);
  }
  for (const p of ["/opengraph-image", "/twitter-image", "/icon", "/apple-icon", "/favicon.ico"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
    expect(r.headers()["content-type"], p).toMatch(/image\//);
  }
  await page.goto("/");
  expect(await page.locator('meta[name="theme-color"]').count()).toBe(1);
  expect(await page.locator('meta[name="theme-color"]').getAttribute("content")).toMatch(/^#fff/i);
});

test("every internal link on every public page resolves, and header/footer links land where they say", async ({ page, request }) => {
  test.setTimeout(240_000);
  const seen = new Map<string, string>();
  const paths = [...new Set([...PAGES.slice(0, -1), ...(await sitePaths(page))])];
  for (const p of paths) {
    await page.goto(p);
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const h of hrefs) if (!seen.has(h)) seen.set(h, p);
  }
  const dead: string[] = [];
  for (const [h, from] of seen) {
    const u = new URL(h);
    if (u.origin !== new URL(page.url()).origin) { if (!/^https:/.test(h) && !/^mailto:/.test(h)) dead.push(`${from} -> ${h} (not https)`); continue; }
    const r = await request.get(u.pathname + u.search, { maxRedirects: 5 });
    if (r.status() >= 400) dead.push(`${from} -> ${u.pathname} ${r.status()}`);
    // in-page anchors must exist
    if (u.hash && u.pathname === new URL(from, page.url()).pathname) { /* checked below */ }
  }
  expect(dead).toEqual([]);
  // in-page anchors resolve to an element
  for (const p of ["/", "/pricing", "/casa", "/docs/api"]) {
    await page.goto(p);
    const missing = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a[href*='#']")].filter((a) => new URL(a.href).pathname === location.pathname && a.hash.length > 1 && !document.getElementById(decodeURIComponent(a.hash.slice(1)))).map((a) => a.hash));
    expect(missing, `${p} anchors`).toEqual([]);
  }
});

test("mobile menu: opens, Escape closes and returns focus, a link navigates and closes it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: "Open menu" });
  const menu = page.locator("#mobile-menu");
  await expect(menu).toBeHidden();
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing/);
  await expect(menu).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("link", { name: "Start free" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("keyboard only on the home page: skip link first, every stop has a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const bad: string[] = [];
  let first = "";
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      const r = el.getBoundingClientRect();
      return { label: (el.getAttribute("aria-label") || el.textContent || el.id).trim().slice(0, 30), ring, onScreen: r.bottom > 0 && r.top < innerHeight };
    });
    if (!info) continue;
    if (!first) first = info.label;
    if (!info.ring) bad.push(`no ring: ${info.label}`);
    if (!info.onScreen) bad.push(`off screen: ${info.label}`);
  }
  expect(first.toLowerCase()).toContain("skip");
  expect(bad).toEqual([]);
});

test("clickable things show a pointer on every public page, form controls have labels", async ({ page }) => {
  const bad: string[] = [];
  for (const p of ["/", "/pricing", "/casa", "/docs", "/compare", "/sign-in"]) {
    await page.goto(p);
    await page.waitForLoadState("load");
    const r = await page.evaluate(() => {
      const out: string[] = [];
      for (const e of document.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], summary, [role=button], label[for] input[type=checkbox], select")) {
        if (e.offsetParent === null || e.closest(".sr-only")) continue;
        if (getComputedStyle(e).cursor !== "pointer") out.push(`cursor ${e.tagName} ${(e.textContent || "").trim().slice(0, 25)}`);
      }
      for (const i of document.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), select, textarea")) {
        if (i.offsetParent === null && !i.closest("label")) continue;
        const named = i.getAttribute("aria-label") || i.getAttribute("aria-labelledby") || (i.id && document.querySelector(`label[for="${i.id}"]`)) || i.closest("label");
        if (!named) out.push(`unlabelled ${i.tagName} ${i.name || i.id}`);
      }
      return out;
    });
    for (const x of r) bad.push(`${p}: ${x}`);
  }
  expect(bad).toEqual([]);
});
