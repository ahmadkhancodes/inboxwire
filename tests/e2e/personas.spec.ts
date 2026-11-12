import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { planById } from "../../src/config/product";
import { uiSignIn, watch } from "./qa/helpers";

// Persona walk-throughs (docs/QA-REPORT.md "Usefulness pass"): day 1 first value, day 2 a teammate or second thing,
// day 7 the plan limit and the decision to pay. Clicks are counted from the first dashboard screen and held to a budget.

class Clicks {
  n = 0;
  async click(l: Locator) { this.n++; await l.click(); }
}

async function newOrg(page: Page, tag: string, org: string) {
  await page.goto(await uiSignIn(page, `${tag}+${Date.now()}@studio.test`));
  await page.getByLabel("Organization name").fill(org);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.waitForLoadState("networkidle");
}

const nav = (page: Page, name: string) => page.getByRole("navigation").getByRole("link", { name, exact: true }).first();

test("Felix (AI email agent founder): first connect link in 2 clicks, first API call from a copied snippet", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const problems = watch(page);
  await newOrg(page, "felix", "Fyxer Labs");

  // Day 1: the overview says where they are.
  await expect(page.getByTestId("onboarding-progress")).toHaveText("0 of 4 done.");

  // First value without code: a connect link for their own inbox. Budget: 2 clicks from the overview.
  const c = new Clicks();
  await c.click(nav(page, "Lines"));
  await c.click(page.getByRole("button", { name: "Create connect link" }));
  const url = await page.getByTestId("connect-link-url").textContent();
  expect(c.n).toBeLessThanOrEqual(2);
  expect(url).toMatch(new RegExp(`^${baseURL}/connect/cl_`));
  // The link opens the hosted connect page, which asks only for the address and finds the provider.
  await page.goto(url!);
  await expect(page.getByRole("heading", { name: "Connect your mailbox" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();

  // Day 2: an admin key for their backend. The reveal includes a curl personalised with the real key; it runs as shown.
  await page.goto("/app/keys");
  await page.getByLabel("Name", { exact: true }).fill("Agent backend");
  await page.getByLabel("Scope").selectOption("admin");
  await page.getByRole("button", { name: "Create key" }).click();
  const snippet = (await page.getByTestId("first-call-snippet").textContent())!;
  const key = (await page.locator("[role=status] code").first().textContent())!;
  expect(snippet).toContain(`Bearer ${key}`);
  expect(snippet).toContain(`${baseURL}/v1/connect-links`);
  const out = execFileSync("bash", ["-c", snippet.replace(/^curl /, "curl -sS --fail-with-body ")], { encoding: "utf8" });
  expect(JSON.parse(out).url).toContain("/connect/cl_");

  await page.goto("/app");
  await expect(page.getByTestId("onboarding-progress")).toHaveText("1 of 4 done.");
  // The next open step is the primary button.
  await expect(page.getByRole("link", { name: "Add an endpoint" })).toHaveClass(/\bbg-action\b/);
  await expect(page.getByRole("link", { name: "Create a key" })).not.toHaveClass(/\bbg-action\b/);
  expect(problems).toEqual([]);
});

test("Ian (internal tools): read-only key gets a snippet it may run; webhook added; data exports", async ({ page, baseURL }) => {
  const problems = watch(page);
  await newOrg(page, "ian", "Ops Tools");
  await page.goto("/app/keys");
  await page.getByLabel("Name", { exact: true }).fill("n8n reader");
  await page.getByRole("button", { name: "Create key" }).click();
  const snippet = (await page.getByTestId("first-call-snippet").textContent())!;
  expect(snippet).toContain(`${baseURL}/v1/accounts`);
  await expect(page.getByText("Creating connect links and webhooks needs an admin key.")).toBeVisible();
  const out = execFileSync("bash", ["-c", snippet.replace(/^curl /, "curl -sS --fail-with-body ")], { encoding: "utf8" });
  expect(JSON.parse(out)).toEqual({ items: [] });

  // Day 2: the second thing is a webhook endpoint.
  await page.goto("/app/settings/webhooks");
  await page.getByLabel("Endpoint URL").fill("https://n8n.example.com/webhook/inboxwire");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText(/Signing secret for/)).toBeVisible();
  await page.goto("/app");
  await expect(page.getByTestId("onboarding-progress")).toHaveText("2 of 4 done.");

  // Their data leaves with them: the profile export is JSON.
  await page.goto("/app/settings/profile");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download my data" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  expect(problems).toEqual([]);
});

test("Clara (CTO, vertical CRM): invites a teammate, hits the mailbox cap, sees why and where to pay", async ({ page, baseURL }) => {
  const problems = watch(page, { allowStatus: [503] });
  await newOrg(page, "clara", "Northwind CRM");

  // Day 2: invite the backend lead; the invitation e-mail arrives with an accept link.
  await page.goto("/app/settings/members");
  const lead = `lead+${Date.now()}@northwind.test`;
  await page.getByLabel("Email", { exact: true }).fill(lead);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(lead)}`)).json()).messages.length).toBeGreaterThan(0);
  const invite = (await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(lead)}`)).json()).messages.at(-1).text as string;
  expect(invite).toMatch(/accept-invite/);

  // Day 7: more customers connected than Developer allows (seeded 6 on a 3 mailbox plan).
  expect((await page.request.post("/api/dev/seed", { headers: { origin: baseURL! } })).ok()).toBeTruthy();
  const free = planById("free")!;
  await page.goto("/app/lines");
  await page.getByRole("button", { name: "Create connect link" }).click();
  // Before handing out another link she is told it would be refused, and where the plans are.
  await expect(page.getByText(`All ${free.limits.mailboxes} mailboxes on ${free.name} are in use`)).toBeVisible();
  await page.getByRole("link", { name: "See plans" }).first().click();
  await expect(page).toHaveURL(/\/app\/billing/);
  const growth = planById("growth")!;
  await expect(page.getByText(growth.name).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`${growth.limits.mailboxes}\\s+mailboxes`)).first()).toBeVisible();
  // Choosing a plan goes to checkout (here Stripe is not configured, so the calm explanation shows; nothing charged).
  await page.getByRole("button", { name: growth.cta }).first().click();
  await expect(page.getByText(/Billing is not connected yet|checkout\.stripe\.com/).first()).toBeVisible();
  expect(problems).toEqual([]);
});
