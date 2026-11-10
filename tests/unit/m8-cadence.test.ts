import { describe, expect, it } from "vitest";
import { cadence, SCHEDULER } from "@/config/product";
import { webhooks } from "@/content/docs/webhooks";
import { metadata as status } from "@/app/(marketing)/status/page";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Tape } from "@/components/marketing/demo/lines-ticker";
import fs from "node:fs";
import path from "node:path";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
const FAST = /every (\d+ )?(minute|second)s?|within (a few )?(minute|second)s?|real-?time|\d+ ?s ago|minutes? ago|in 60 s/i;

describe("cadence constant and page copy agree", () => {
  it("status metadata and docs use the constant", () => {
    expect(String(status.description)).toContain(cadence.probeShort);
    expect(JSON.stringify(webhooks)).toContain(cadence.retryHeadline);
    expect(read("src/app/(marketing)/status/page.tsx")).toContain("cadence.probeSentence");
    expect(read("src/app/(marketing)/docs/api/page.tsx")).toContain("cadence.retryApi");
  });
  it("demo tape retry text comes from the constant", () => {
    expect(renderToStaticMarkup(createElement(Tape))).toContain(cadence.demoRetry);
  });
  it("while the scheduler is daily, no public copy promises faster than daily", () => {
    if (SCHEDULER !== "daily") return;
    const files = [
      "src/app/(marketing)/status/page.tsx",
      "src/content/docs/webhooks.ts",
      "src/content/docs/billing.ts",
    ];
    for (const f of files) {
      const src = read(f).replace(/cadence\.\w+/g, "");
      expect(src.match(/every 5 minutes|every minute|probed every/i), f).toBeNull();
    }
    expect(cadence.probeSentence).not.toMatch(FAST);
    expect(cadence.retryHeadline).not.toMatch(FAST);
    expect(cadence.cronLine).not.toMatch(FAST);
    expect(cadence.demoRetry).not.toMatch(FAST);
    expect(cadence.demoImapLast).not.toMatch(FAST);
    expect(JSON.stringify(webhooks)).not.toMatch(/30 seconds|2 minutes|10 minutes/);
  });
});
