import { expect, test } from "@playwright/test";

test("hosted connect page explains an unknown link instead of showing a form", async ({ page }) => {
  await page.goto("/connect/cl_not-a-real-token");
  await expect(page.getByRole("heading", { name: "This link is not valid" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
});

test("connect-done page renders and /v1/connect-links needs an API key", async ({ page, request }) => {
  await page.goto("/connect/done?email=ana%40example.test");
  await expect(page.getByRole("heading", { name: "Mailbox connected" })).toBeVisible();
  const res = await request.post("/v1/connect-links", { data: {} });
  expect(res.status()).toBe(401);
});

test("provider hooks reject unsigned calls and echo the Graph validation token", async ({ request }) => {
  const g = await request.post("/api/hooks/graph/missing-env?validationToken=hello-token");
  expect(g.status()).toBe(200);
  expect(await g.text()).toBe("hello-token");
  const gm = await request.post("/api/hooks/gmail/missing-env", { data: {} });
  expect(gm.status()).toBe(404);
});
