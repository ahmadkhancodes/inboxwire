import { expect, test, type Page } from "@playwright/test";
import { uiSignIn, watch } from "../qa/helpers";
import { scanPage } from "./scan";
import { plans } from "@/config/product";

const APP = ["/app", "/app/lines", "/app/deliveries", "/app/outbox", "/app/ticker", "/app/keys", "/app/billing", "/app/oauth-clients",
  "/app/settings/members", "/app/settings/webhooks", "/app/settings/oauth-clients", "/app/settings/security", "/app/settings/api-keys", "/app/settings/profile", "/app/settings/audit"];

async function signUp(page: Page, tag: string, next = "/app", org = "QA2 Org") {
  await page.goto(await uiSignIn(page, `${tag}+${Date.now()}@studio.test`, next, "next"));
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Organization name").fill(org);
  await page.getByRole("button", { name: "Create organization" }).click();
}
const seed = (page: Page) => page.request.post("/api/dev/seed", { headers: { origin: new URL(page.url()).origin } });

test("redirects: a deep link survives sign-in and onboarding; sign-out lands on the home page; signed-in /sign-in goes to the app", async ({ page }) => {
  const problems = watch(page, { allowStatus: [429] });
  await signUp(page, "deep", "/app/keys");
  await expect(page).toHaveURL(/\/app\/keys$/);
  await expect(page.locator("h1").first()).toBeVisible();
  // already signed in: the sign-in page does not trap the user
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/app$/);
  // open redirect attempts are ignored
  await page.goto("/sign-in?next=https://evil.example/");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/sign-in?next=//evil.example");
  await expect(page).toHaveURL(/\/app$/);
  // pricing hand-off lands on billing with the plan preselected
  await page.goto("/sign-in?plan=growth&interval=month");
  await expect(page).toHaveURL(/\/app\/billing\?plan=growth&interval=month/);
  await expect(page.getByText(/Continue with Cloud Growth/)).toBeVisible();
  // sign out from the sidebar (desktop)
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await expect(page).toHaveURL(/localhost:3100\/$/);
  await page.goto("/app/billing");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fbilling/);
  expect(problems).toEqual([]);
});

test("pricing page hand-off: a visitor choosing a paid plan signs in and arrives at that plan", async ({ page }) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");
  const cta = page.getByRole("link", { name: /Cloud Growth/i }).first();
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute("href");
  expect(href).toMatch(/\/sign-in\?.*plan=growth/);
  await cta.click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("checkout return: canceled and success URLs show a message instead of a bare billing page", async ({ page }) => {
  await signUp(page, "co");
  await expect(page).toHaveURL(/\/app/);
  await page.goto("/app/billing?checkout=canceled");
  await expect(page.getByText("Checkout canceled")).toBeVisible();
  await expect(page.getByText(/Nothing was charged/).first()).toBeVisible();
  await page.goto("/app/billing?checkout=success&session_id=cs_test_none");
  await expect(page.getByText(/Confirming your payment|Your plan is active|That did not go through|Billing is not connected/).first()).toBeVisible();
  await expect(page.getByText("This page could not load")).toHaveCount(0);
});

for (const vp of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`free user and user over the plan limit: every app screen is on-brand, readable and unclipped (${vp.width}px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(vp);
    const problems = watch(page, { allowStatus: [429, 503] });
    await signUp(page, "scan");
    await expect(page).toHaveURL(/\/app/);
    const bad: string[] = [];
    const scanAll = async (label: string) => {
      for (const p of APP) {
        const res = await page.goto(p);
        await page.waitForLoadState("load");
        await page.waitForTimeout(350);
        expect(res?.status(), p).toBeLessThan(400);
        for (const x of await scanPage(page)) bad.push(`${label} ${p}: ${x}`);
      }
    };
    await scanAll("free");
    await seed(page); // 6 lines on a 3 line plan
    await page.goto("/app");
    await expect(page.locator("main")).toContainText(/of 3/);
    await scanAll("over-limit");
    expect(bad).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test("dialogs and menus: Escape closes them, focus returns, the mobile app menu works", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signUp(page, "esc");
  await expect(page).toHaveURL(/\/app/);
  await page.waitForLoadState("load");
  const menu = page.getByRole("button", { name: /menu/i }).first();
  await expect(menu).toBeVisible();
  await menu.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog").or(page.locator("[aria-modal=true]")).first()).toBeHidden();
  await menu.click();
  await page.getByRole("link", { name: "Keys", exact: true }).last().click();
  await expect(page).toHaveURL(/\/app\/keys/);
});

test("keyboard only inside the app: focus moves through many controls, each with a visible ring", async ({ page }) => {
  await signUp(page, "kbapp");
  await expect(page).toHaveURL(/\/app/);
  await page.waitForLoadState("load");
  const bad: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      return { label: (el.getAttribute("aria-label") || el.textContent || el.id).trim().slice(0, 30), ring, tag: el.tagName };
    });
    if (!info) continue;
    seen.add(info.label);
    if (!info.ring) bad.push(`no ring: ${info.tag} ${info.label}`);
  }
  expect(seen.size, "focus must move through many different controls").toBeGreaterThan(10);
  expect(bad).toEqual([]);
});

test("prices and limits on the pricing page come from the plan config", async ({ page }) => {
  await page.goto("/pricing");
  await page.waitForLoadState("load");
  const text = await page.locator("main").innerText();
  const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
  const check = (t: string, interval: string) => { for (const pl of plans) for (const pr of pl.prices) if (pr.interval === interval) expect(t, `${pl.name} ${pr.interval}`).toContain(money(pr.usd)); };
  check(text, "year");
  await page.getByRole("button", { name: "Monthly" }).first().click();
  check(await page.locator("main").innerText(), "month");
  for (const pl of plans) if (pl.limits.mailboxes < 1e6) expect(text, pl.name).toContain(`${pl.limits.mailboxes} mailboxes`);
});
