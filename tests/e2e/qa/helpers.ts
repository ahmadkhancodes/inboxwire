import { expect, type Page } from "@playwright/test";

/** Collects console errors, page errors and failed same-origin requests. */
export const step = { name: "" };
export function watch(page: Page, opts: { allowStatus?: number[] } = {}) {
  const problems: string[] = [];
  const allow = opts.allowStatus ?? [];
  page.on("console", (m) => {
    // /_vercel/insights only exists on Vercel; locally it 404s by design
    if (/_vercel|Failed to load resource.*404/.test(m.text() + (m.location().url || ""))) return;
    // HTTP failures are reported once, with their URL, by the response listener below
    if (/Failed to load resource/.test(m.text())) return;
    if (m.type() === "error" || /hydrat/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror@${step.name}@${page.url()}: ${e.message}`));
  page.on("requestfailed", (r) => /_vercel|_rsc=|ERR_ABORTED/.test(r.url() + (r.failure()?.errorText ?? "")) || problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin === new URL(page.url() === "about:blank" ? r.url() : page.url()).origin && r.status() >= 400 && r.status() !== 404 && !allow.includes(r.status())) problems.push(`${r.status()} ${r.request().method()} ${u.pathname}`);
  });
  return problems;
}

/** Sign in through the real form and the e-mail outbox. */
export async function uiSignIn(page: Page, email: string, callback = "/app") {
  // Better Auth throttles magic links per IP (5/min); give each simulated visitor their own address
  const n = () => Math.floor(Math.random() * 250);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
  await page.goto(`/sign-in?callbackURL=${encodeURIComponent(callback)}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`Check your inbox at ${email}`)).toBeVisible();
  let link: string | undefined;
  await expect.poll(async () => {
    const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1)?.text ?? "")?.[0];
    return link;
  }).toBeTruthy();
  return link!;
}
