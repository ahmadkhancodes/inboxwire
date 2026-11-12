/**
 * Playwright screenshots of the signed-in dashboard at 375 and 1440, light -> docs/qa/<date>-m4/.
 * Needs a server started with E2E_OUTBOX=1 and DB_DRIVER=memory (it seeds demo data through /api/dev/seed):
 *   E2E_OUTBOX=1 DB_DRIVER=memory NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next start -p 3100
 *   BASE_URL=http://localhost:3100 CHROME_PATH=/usr/bin/google-chrome npx tsx scripts/screenshots-app.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT_DIR ?? `docs/qa/${new Date().toISOString().slice(0, 10)}-m4`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const problems: string[] = [];
  const origin = { origin: BASE };
  {
    const theme = "light" as const;
    for (const width of [375, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 812 : 900 }, colorScheme: theme, baseURL: BASE });
      const page = await ctx.newPage();
      const email = `shots+${Date.now()}${width}${theme}@studio.test`;
      await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
      const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
      await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
      const org = await page.request.post("/api/auth/organization/create", { data: { name: "Northwind CRM", slug: `nw-${Date.now()}${width}${theme}` }, headers: origin });
      await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
      const { lines } = (await (await page.request.post("/api/dev/seed", { headers: origin })).json()) as { lines: string[] };
      const routes = ["/app", "/app/lines", `/app/lines/${lines[4]}`, "/app/ticker", "/app/deliveries", "/app/outbox", "/app/keys", "/app/oauth-clients", "/app/billing"];
      for (const r of routes) {
        await page.goto(r, { waitUntil: "load" });
        await page.waitForTimeout(1200); // lets the SSE snapshot arrive and the lamp row settle
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) problems.push(`${r} @${width} ${theme}: horizontal overflow ${overflow}px`);
        const name = `${r.replace(/^\/app\/?/, "app-").replace(/\/[0-9a-f-]{20,}$/, "-detail").replace(/\//g, "_").replace(/^app-$/, "app-overview")}-${width}-${theme}.png`;
        await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`screenshots in ${OUT}`);
  if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
}
main();
