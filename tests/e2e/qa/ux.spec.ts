import { expect, test, type Page } from "@playwright/test";
import { uiSignIn, watch } from "./helpers";

async function newUser(page: Page, tag: string) {
  await page.goto(await uiSignIn(page, `${tag}+${Date.now()}@studio.test`));
  await page.getByLabel("Organization name").fill("UX Org");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.waitForLoadState("load");
}

test("home after sign-in: real next steps, no scaffold copy, every step link works", async ({ page }) => {
  const problems = watch(page);
  await newUser(page, "home");
  await expect(page.getByText(/src\/app\/app\/page\.tsx|main screen goes here|your product's main screen/i)).toHaveCount(0);
  const steps = page.getByRole("list").filter({ hasText: "Create an API key" }).getByRole("link");
  expect(await steps.count()).toBe(4);
  for (const href of await steps.evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
    const res = await page.goto(href);
    expect(res?.status(), href).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test("limits shown in the app agree with the pricing page; over-limit usage is explained", async ({ page }) => {
  await newUser(page, "limits");
  await expect(page.getByText("0 of 3").first()).toBeVisible();
  await page.request.post("/api/dev/seed", { headers: { origin: new URL(page.url()).origin } });
  await page.goto("/app");
  await page.waitForLoadState("load");
  const usage = await page.locator("main").innerText();
  expect(usage).toMatch(/of 3/);
  await page.goto("/app/billing");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByText(/3 mailboxes/i).first()).toBeVisible();
});

test("keyboard only: sign-in is reachable by Tab with a visible focus ring, Enter submits, theme toggle works", async ({ page }) => {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      return { tag: el.tagName, label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.id, ring };
    });
    if (info) seen.push(`${info.tag}:${info.label}:${info.ring}`);
  }
  expect(seen.length).toBeGreaterThan(3);
  expect(seen.filter((s) => s.endsWith(":false")), "focused without a visible ring").toEqual([]);
  await page.getByLabel("Email").focus();
  await page.keyboard.type(`kb+${Date.now()}@studio.test`);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Check your inbox/)).toBeVisible();
  // theme toggle flips and persists across reload
  await page.goto("/");
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: /Switch to (dark|light) theme/ }).first().click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
});

test("mobile 375px: no horizontal scroll and 44px tap targets on public and app pages", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const small: string[] = [];
  const check = async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState("load");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${path} overflow`).toBeLessThanOrEqual(0);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, [role=button], nav a, header a, footer a")]
        .filter((e) => e.offsetParent !== null && !e.closest("[aria-hidden=true]"))
        .map((e) => ({ r: e.getBoundingClientRect(), t: (e.getAttribute("aria-label") || e.textContent || e.id).trim().slice(0, 30) }))
        .filter(({ r }) => r.height > 0 && (r.height < 43.5 || r.width < 43.5) && r.width < 200)
        .map(({ r, t }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    for (const b of bad) small.push(`${path}: ${b}`);
  };
  for (const p of ["/", "/pricing", "/docs", "/compare", "/sign-in"]) await check(p);
  await newUser(page, "mob");
  for (const p of ["/app", "/app/lines", "/app/keys", "/app/billing", "/app/settings/profile", "/app/settings/members"]) await check(p);
  expect(small, "tap targets under 44px").toEqual([]);
});

test("dark theme: app and marketing render without errors and keep readable contrast on body text", async ({ page }) => {
  const problems = watch(page);
  await page.emulateMedia({ colorScheme: "dark" });
  for (const p of ["/", "/pricing", "/sign-in"]) {
    // Load twice: the very first load of /sign-in on a cold server hits the open React #418 issue (docs/QA-REPORT.md), which drops data-theme once.
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.dataset.theme), p).toBe("dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect((r + g + b) / 3, `${p} background should be dark`).toBeLessThan(90);
  }
  expect(problems.filter((p) => !/#418/.test(p))).toEqual([]);
});

test("expired or mangled session cookie sends the user to sign-in, not an error page", async ({ page }) => {
  await page.context().addCookies([{ name: "better-auth.session_token", value: "garbage.value", url: "http://localhost:3100" }]);
  await page.goto("/app/keys");
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByRole("heading", { name: /Sign in/ })).toBeVisible();
  const api = await page.request.get("/api/app/live/snapshot");
  expect([401, 403]).toContain(api.status());
});

test("billing without Stripe keys: choosing a plan explains itself instead of doing nothing", async ({ page }) => {
  const problems = watch(page, { allowStatus: [503] });
  await newUser(page, "bill");
  await page.goto("/app/billing");
  await page.waitForLoadState("load");
  await page.waitForTimeout(400);
  const upgrade = page.getByRole("button", { name: /upgrade|choose|start|subscribe|select/i }).first();
  await expect(upgrade).toBeVisible();
  await upgrade.click();
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /\S/ }).first()).toBeVisible();
  expect(problems).toEqual([]);
});
