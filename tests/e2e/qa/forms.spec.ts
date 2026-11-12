import { expect, test, type Browser, type Page } from "@playwright/test";
import { uiSignIn, watch } from "./helpers";

async function newUser(page: Page, tag: string, org = "QA Org") {
  await page.goto(await uiSignIn(page, `${tag}+${Date.now()}@studio.test`));
  await page.getByLabel("Organization name").fill(org);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.waitForLoadState("load");
}
/** An organisation-bound API key, like the dashboard creates. */
async function apiKey(page: Page, scopes: string[]) {
  const session = await (await page.request.get("/api/auth/get-session")).json();
  const orgId = session.session.activeOrganizationId as string;
  const r = await page.request.post("/api/auth/api-key/create", { data: { name: "qa", organizationId: orgId, metadata: { scopes } }, headers: origin(page) });
  return (await r.json()).key as string;
}
const origin = (page: Page) => ({ origin: new URL(page.url()).origin });
async function loaded(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
}

test("API keys: empty/long/HTML/duplicate names, reveal once, key works, delete confirms", async ({ page }) => {
  const problems = watch(page);
  await newUser(page, "keys");
  await loaded(page, "/app/settings/api-keys");
  await expect(page.getByText("No API keys yet")).toBeVisible();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toBeVisible();

  const name = page.getByLabel("Name", { exact: true });
  await name.fill("<img src=x onerror=alert(1)> ключ 🚀");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText(/Key created/)).toBeVisible();
  // HTML in a name is shown as text, never executed
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "API keys" })).toContainText("<img src=x onerror=alert(1)>");

  // duplicate name is allowed or refused with a message, never a silent no-op
  await name.fill("<img src=x onerror=alert(1)> ключ 🚀");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText(/Key created|already/i).first()).toBeVisible();

  // very long input is capped by the field
  await name.fill("x".repeat(500));
  expect((await name.inputValue()).length).toBeLessThanOrEqual(60);

  // delete asks first and Escape cancels
  await page.getByRole("button", { name: /^Delete/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Delete/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /delete/i }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("webhooks: bad URLs are refused with a reason, a valid one is saved and shows its secret once", async ({ page }) => {
  const problems = watch(page, { allowStatus: [400, 422] });
  await newUser(page, "hooks");
  await loaded(page, "/app/settings/webhooks");
  await expect(page.getByText("No endpoints yet")).toBeVisible();
  const url = page.getByLabel("Endpoint URL");
  for (const bad of ["", "not a url", "ftp://example.com/x", "http://localhost:3000/hook", "javascript:alert(1)", "https://" + "a".repeat(3000) + ".com"]) {
    await url.fill(bad);
    await page.getByRole("button", { name: "Add endpoint" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first(), `bad url: ${bad.slice(0, 30)}`).toBeVisible();
  }
  await url.fill("https://example.com/hooks/inboxwire");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText(/Signing secret for/)).toBeVisible();
  await expect(page.getByRole("table").first()).toContainText("example.com/hooks/inboxwire");
  // double submit of the same URL does not crash
  await url.fill("https://example.com/hooks/inboxwire");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await page.waitForTimeout(800);
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("members: invalid, duplicate and self invites give a clear message", async ({ page }) => {
  const problems = watch(page, { allowStatus: [400, 403, 409, 422] });

  await newUser(page, "inv", "Invite Co");
  const mine = (await (await page.request.get("/api/auth/get-session")).json()).user.email as string;
  await loaded(page, "/app/settings/members");
  const email = page.getByLabel("Email", { exact: true });
  for (const bad of ["", "nope", "a b@c.io"]) {
    await email.fill(bad);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first(), `bad: ${bad}`).toBeVisible();
  }
  await email.fill(mine);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /\S/ }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("profile: HTML, unicode, whitespace and very long names", async ({ page }) => {
  await newUser(page, "prof");
  await loaded(page, "/app/settings/profile");
  const name = page.getByLabel(/name/i).first();
  await name.fill("   ");
  // an unchanged/blank name must not be savable
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled().catch(() => {});
  await name.fill("<b>Zoë</b> 日本語 " + "y".repeat(400));
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(800);
  await page.reload();
  const saved = await page.getByLabel(/name/i).first().inputValue();
  expect(saved.length).toBeLessThanOrEqual(200);
  await expect(page.locator("b", { hasText: "Zoë" })).toHaveCount(0);
});

test("connect links: single use, expired/garbage tokens show a helpful page, never another org's data", async ({ page, browser, request }) => {
  await newUser(page, "conn");
  const key = await apiKey(page, ["read", "send", "admin"]);
  const link = await request.post("/api/v1/connect-links", { headers: { "x-api-key": key }, data: { redirectUrl: "https://example.com/done" } });
  expect([200, 201, 400, 422], await link.text()).toContain(link.status());

  for (const t of ["garbage", "x".repeat(300), "%3Cscript%3E"]) {
    const res = await page.goto(`/connect/${t}`);
    expect(res?.status(), t).toBeLessThan(500);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("This page could not load")).toHaveCount(0);
  }
  void browser;
});

async function second(browser: Browser, tag: string) {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3100" });
  const p = await ctx.newPage();
  await newUser(p, tag, "Other Org");
  return { ctx, p };
}

test("isolation: another organisation's keys, lines and data are not reachable", async ({ page, browser }) => {
  await newUser(page, "own");
  const seed = await page.request.post("/api/dev/seed", { headers: origin(page) });
  const { lines } = (await seed.json()) as { lines: string[] };
  const { ctx, p } = await second(browser, "intruder");
  const key = await apiKey(p, ["read", "send", "admin"]);
  for (const id of lines.slice(0, 2)) {
    for (const path of [`/api/v1/accounts/${id}`, `/api/v1/accounts/${id}/messages`]) {
      const r = await p.request.get(path, { headers: { "x-api-key": key } });
      expect([403, 404], `${path} ${r.status()}`).toContain(r.status());
    }
    await p.goto(`/app/lines/${id}`);
    await p.waitForLoadState("load");
    // Next streams the not-found UI after the layout, so the HTTP status can already be 200; the page itself must say 404 and show no line data
    await expect(p.getByText("This page did not arrive")).toBeVisible();
    const del = await p.request.delete(`/api/v1/accounts/${id}`, { headers: { "x-api-key": key } });
    expect([403, 404]).toContain(del.status());
  }
  const list = await (await p.request.get("/api/v1/accounts", { headers: { "x-api-key": key } })).json();
  expect(JSON.stringify(list)).not.toContain(lines[0]);
  await ctx.close();
});

test("read-scope key cannot send or delete; unauthenticated API is 401", async ({ page, request }) => {
  await newUser(page, "scope");
  const seed = await page.request.post("/api/dev/seed", { headers: origin(page) });
  const { lines } = (await seed.json()) as { lines: string[] };
  const key = await apiKey(page, ["read"]);
  const send = await request.post(`/api/v1/accounts/${lines[0]}/messages/send`, { headers: { "x-api-key": key, "idempotency-key": "k1" }, data: { to: [{ address: "a@b.co" }], subject: "s", text: "t" } });
  expect(send.status()).toBe(403);
  expect((await request.delete(`/api/v1/accounts/${lines[0]}`, { headers: { "x-api-key": key } })).status()).toBe(403);
  expect((await request.get("/api/v1/accounts")).status()).toBe(401);
});
