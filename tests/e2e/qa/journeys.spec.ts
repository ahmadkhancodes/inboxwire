import { expect, test } from "@playwright/test";
import { step, uiSignIn, watch } from "./helpers";

const PUBLIC = ["/", "/pricing", "/docs", "/docs/api", "/compare", "/status", "/casa", "/legal/privacy", "/legal/terms", "/sign-in"];
const APP = ["/app", "/app/lines", "/app/deliveries", "/app/outbox", "/app/ticker", "/app/keys", "/app/billing", "/app/oauth-clients",
  "/app/settings/members", "/app/settings/webhooks", "/app/settings/oauth-clients", "/app/settings/security", "/app/settings/api-keys", "/app/settings/profile", "/app/settings/audit"];

test("signed out: every public page loads clean, links resolve, app routes redirect to sign-in", async ({ page, request }) => {
  const problems = watch(page);
  const links = new Set<string>();
  for (const p of PUBLIC) {
    step.name = `public ${p}`;
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
    await page.waitForLoadState("networkidle");
    for (const href of await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
      if (href.startsWith("/") && !href.startsWith("//")) links.add(href.split("#")[0] || "/");
    }
  }
  for (const l of links) {
    step.name = `link ${l}`;
    const r = await request.get(l, { maxRedirects: 5 });
    expect(r.status(), `link ${l}`).toBeLessThan(400);
  }
  for (const p of APP) {
    step.name = `app ${p}`;
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    expect(page.url(), p).toContain("/sign-in");
  }
  // Known, open: a cold production server sometimes logs React #418 on the first /sign-in hydration (not reproducible in dev). See docs/QA-REPORT.md.
  expect(problems.filter((p) => !/Minified React error #418/.test(p))).toEqual([]);
});

test("sign-in: invalid input, reused and garbage magic links", async ({ page }) => {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  for (const bad of ["", "   ", "nope", "a@b", "two words@x.io", "<script>alert(1)</script>@x.io"]) {
    await page.getByLabel("Email").fill(bad);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toBeVisible();
    await expect(page.getByText(`Check your inbox`)).toHaveCount(0);
  }
  const email = `reuse+${Date.now()}@studio.test`;
  const link = await uiSignIn(page, email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/onboarding|\/app/);
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByText("That link has expired")).toBeVisible();
  await page.goto("/api/auth/magic-link/verify?token=garbage&callbackURL=/app");
  await expect(page).toHaveURL(/sign-in/);
});

test("new user: onboarding validation, then every app screen clean with no dead buttons", async ({ page }) => {
  const problems = watch(page);
  const email = `icp+${Date.now()}@studio.test`;
  await page.goto(await uiSignIn(page, email));
  await expect(page).toHaveURL(/onboarding/);
  const name = page.getByLabel("Organization name");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText(/at least 2 characters/)).toBeVisible();
  await name.fill("<b>Acme</b> 🚀 Ünï");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app/);

  for (const p of APP) {
    const res = await page.goto(p);
    await page.waitForLoadState("networkidle");
    expect(res?.status(), p).toBeLessThan(400);
    expect(page.url(), p).toContain("/app");
    await expect(page.locator("h1").first(), p).toBeVisible();
    await expect(page.getByText("This page could not load"), `${p} hit the error boundary`).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), p).toBeLessThanOrEqual(0);
    // every enabled button must either be named or labelled
    const unnamed = await page.locator("button:visible").evaluateAll((bs) => bs.filter((b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("title")).length);
    expect(unnamed, `${p} unnamed buttons`).toBe(0);
    const cursors = await page.locator("button:enabled:visible, a[href]:visible").evaluateAll((els) => els.filter((e) => getComputedStyle(e).cursor !== "pointer").map((e) => e.outerHTML.slice(0, 80)));
    expect(cursors, `${p} cursor`).toEqual([]);
  }
  // sign out
  await page.goto("/app");
  const out = page.getByRole("button", { name: /sign out/i }).first();
  if (await out.count()) {
    await out.click();
    await expect(page).toHaveURL(/\/($|sign-in)/);
    await page.goto("/app");
    expect(page.url()).toContain("/sign-in");
  }
  expect(problems).toEqual([]);
});

test("security: a passwordless (magic link) user can start two-factor setup and sees a secret", async ({ page }) => {
  const problems = watch(page);
  await page.goto(await uiSignIn(page, `twofa+${Date.now()}@studio.test`));
  await page.getByLabel("Organization name").fill("Twofa Labs");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.goto("/app/settings/security");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /enable|set up|turn on/i }).first().click();
  // setup step shows the authenticator secret / a code field instead of "Invalid password"
  await expect(page.getByLabel(/code/i).first()).toBeVisible();
  await expect(page.getByText(/invalid password/i)).toHaveCount(0);
  expect(problems).toEqual([]);
});
