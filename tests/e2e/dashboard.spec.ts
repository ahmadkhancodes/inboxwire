import { expect, test, type Page } from "@playwright/test";

// M4 dashboard on the memory driver (E2E_OUTBOX=1 enables /api/dev/seed): lines, line detail, ticker, deliveries replay, outbox, keys, billing meter.
async function signIn(page: Page, baseURL: string) {
  const email = `dash+${Date.now()}@studio.test`;
  const origin = { origin: baseURL };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Northwind CRM", slug: `nw-${Date.now()}` }, headers: origin });
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
}

test("dashboard screens: empty states, then seeded lines, ticker, deliveries, outbox, keys, billing", async ({ page, baseURL }) => {
  await signIn(page, baseURL!);

  await page.goto("/app/lines");
  await expect(page.getByRole("heading", { name: "No lines yet" })).toBeVisible();
  await page.goto("/app/deliveries");
  await expect(page.getByRole("heading", { name: "No deliveries yet" })).toBeVisible();
  await page.goto("/app/outbox");
  await expect(page.getByRole("heading", { name: "Nothing queued" })).toBeVisible();
  await page.goto("/app/ticker");
  await expect(page.getByRole("heading", { name: "Nothing on the tape yet" })).toBeVisible();

  const seed = await page.request.post("/api/dev/seed", { headers: { origin: baseURL! } });
  expect(seed.ok()).toBeTruthy();
  const { lines } = (await seed.json()) as { lines: string[] };

  await page.goto("/app/lines");
  const table = page.getByRole("table", { name: "Connected mailboxes" });
  await expect(table.getByRole("row")).toHaveCount(7);
  await expect(table.getByText("sign-in needed", { exact: true })).toBeVisible();
  await expect(table.getByText("unreachable", { exact: true })).toBeVisible();
  await expect(page.getByText("Why, and what to do").first()).toBeVisible();
  await expect(page.getByText(/Live: updates arrive|Polling every 5 seconds/)).toBeVisible({ timeout: 15_000 });

  // state changes show without a reload (SSE or the polling fallback)
  const snap0 = await (await page.request.get("/api/app/live/snapshot")).json();
  expect(snap0.lines).toHaveLength(6);

  await page.goto(`/app/lines/${lines[4]}`);
  await expect(page.getByRole("heading", { name: "m.okafor@tidewater.example" })).toBeVisible();
  await expect(page.getByText("Sign-in needed").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  await page.goto("/app/ticker");
  await expect(page.getByRole("list", { name: "Webhook ticker" }).getByRole("listitem").first()).toBeVisible();

  await page.goto("/app/deliveries");
  await expect(page.getByRole("table", { name: "Webhook deliveries" })).toBeVisible();
  await page.getByRole("button", { name: /^Replay messageNew/ }).first().click();
  await expect(page.getByText(/Delivered|Not delivered/).first()).toBeVisible({ timeout: 20_000 });

  await page.goto("/app/outbox");
  await expect(page.getByText("smtp_not_configured")).toBeVisible();

  await page.goto("/app/keys");
  await expect(page.getByRole("heading", { name: "API keys", exact: true })).toBeVisible();
  await page.goto("/app/oauth-clients");
  await expect(page.getByRole("heading", { name: /OAuth clients/ })).toBeVisible();

  await page.goto("/app/billing");
  await expect(page.getByRole("img", { name: /lamps lit: 6 mailboxes, over the allowance/ })).toBeVisible();
  await expect(page.getByText(/^Over the allowance\. New connections are refused/)).toBeVisible();

  // another org's line is not reachable
  // (the app shell streams, so the status stays 200; the not-found page is what renders)
  await page.goto("/app/lines/not-a-line");
  await expect(page.getByRole("heading", { name: "This page did not arrive" })).toBeVisible();
});

test("public kit download and metrics guard", async ({ request }) => {
  const kit = await request.get("/casa/kit.zip");
  expect(kit.ok()).toBeTruthy();
  expect(kit.headers()["content-type"]).toBe("application/zip");
  expect((await kit.body()).subarray(0, 2).toString()).toBe("PK");
  expect((await request.get("/metrics")).status()).toBeLessThan(500);
});
