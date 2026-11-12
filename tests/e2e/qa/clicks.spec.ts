import { expect, test, type Page } from "@playwright/test";
import { uiSignIn, watch } from "./helpers";

const APP = ["/app", "/app/lines", "/app/deliveries", "/app/outbox", "/app/ticker", "/app/keys", "/app/billing", "/app/oauth-clients",
  "/app/settings/members", "/app/settings/webhooks", "/app/settings/oauth-clients", "/app/settings/security", "/app/settings/api-keys", "/app/settings/profile", "/app/settings/audit"];
const SKIP = /sign out|log out|delete|remove|revoke|disable|leave|passkey|download|export/i;

async function login(page: Page) {
  await page.goto(await uiSignIn(page, `clicks+${Date.now()}@studio.test`));
  await page.getByLabel("Organization name").fill("Clickworks");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.request.post("/api/dev/seed", { headers: { origin: new URL(page.url()).origin } });
}

for (const vp of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`every enabled button does something (${vp.width}px)`, async ({ page }) => {
    test.setTimeout(420_000);
    // 503 = checkout without Stripe keys (stub mode, asserted separately); 429 = our own rapid reloads hit the API rate limit
    const problems = watch(page, { allowStatus: [429, 503] });
    await page.setViewportSize(vp);
    await login(page);
    const dead: string[] = [];
    const disabledNoReason: string[] = [];
    for (const p of APP) {
      await page.goto(p);
      await page.waitForLoadState("load");
      await page.waitForTimeout(400); // live pages keep an SSE open, so networkidle never comes
      const count = await page.locator("main button:visible").count();
      for (let i = 0; i < count; i++) {
        await page.goto(p);
        await page.waitForLoadState("load");
      await page.waitForTimeout(400); // live pages keep an SSE open, so networkidle never comes
        const b = page.locator("main button:visible").nth(i);
        if (!(await b.count())) continue;
        const label = ((await b.innerText()) || (await b.getAttribute("aria-label")) || "").trim().replace(/\s+/g, " ");
        if (await b.isDisabled()) {
          const why = (await b.getAttribute("title")) || (await b.getAttribute("aria-describedby")) || (await b.getAttribute("aria-label"));
          if (!why) disabledNoReason.push(`${p} "${label}"`);
          continue;
        }
        if (SKIP.test(label)) continue;
        // an already-selected toggle, or a refresh that finds nothing new, legitimately changes nothing
        const pressed = await b.getAttribute("aria-pressed");
        if (pressed === "true" || /^refresh$/i.test(label)) continue;
        expect(await page.getByText("This page could not load").count(), `${p} crashed`).toBe(0);
        const before = { url: page.url(), html: await page.locator("body").innerHTML() };
        const requests: string[] = [];
        const onReq = (r: { method(): string; url(): string }) => requests.push(r.method());
        page.on("request", onReq);
        await b.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(600);
        page.off("request", onReq);
        const after = { url: page.url(), html: await page.locator("body").innerHTML() };
        const changed = before.url !== after.url || before.html !== after.html || requests.some((m) => m !== "GET");
        if (!changed) dead.push(`${p} "${label}"`);
        await page.keyboard.press("Escape");
      }
    }
    expect(dead, "buttons that did nothing").toEqual([]);
    expect(disabledNoReason, "disabled with no explanation").toEqual([]);
    expect(problems).toEqual([]);
  });
}
