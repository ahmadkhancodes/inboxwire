import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/marketing/hero";
import { TaglineReveal, taglineWords } from "@/components/marketing/tagline-reveal";
import { menuDelay } from "@/components/marketing/site-header";

// Landing page library (.claude/skills/landing-page-design/SKILL.md) audit, 12 Nov 2026.
const css = readFileSync("src/app/globals.css", "utf8");
const marketingDir = "src/components/marketing";
const marketing = [
  ...readdirSync(marketingDir).filter((f) => f.endsWith(".tsx")).map((f) => join(marketingDir, f)),
  join(marketingDir, "demo/lines-ticker.tsx"),
  "src/app/(marketing)/page.tsx",
  "src/app/(marketing)/layout.tsx",
  "src/components/brand/wordmark.tsx",
].map((p) => [p, readFileSync(p, "utf8")] as const);

const SCALE_PX = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128];

describe("type scale and weights in the global CSS", () => {
  it("every font-size is a Tailwind step", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].map(([, n, u]) => Number(n) * (u === "rem" ? 16 : 1));
    expect(sizes.length).toBeGreaterThan(20);
    expect(sizes.filter((px) => !SCALE_PX.includes(px))).toEqual([]);
  });

  it("no weight above 700 and no italics", () => {
    const weights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map(([, w]) => Number(w));
    expect(weights.filter((w) => w > 700)).toEqual([]);
    expect(css).not.toMatch(/font-style:\s*italic/);
  });

  it("marketing components use named text styles, not arbitrary sizes", () => {
    const bad = marketing.filter(([, c]) => /text-\[\d|fontSize|\bitalic\b|font-black|font-extrabold/.test(c)).map(([p]) => p);
    expect(bad).toEqual([]);
  });

  it("icons come from Phosphor only", () => {
    expect(marketing.filter(([, c]) => /lucide|heroicons|@mui\/icons|material-symbols/.test(c)).map(([p]) => p)).toEqual([]);
  });

  it("motion: no browser default curves and nothing under 300ms on the landing page", () => {
    expect(marketing.filter(([, c]) => /\bease-(linear|in|out|in-out)(?![\w-])|duration-(75|100|150|200)\b/.test(c)).map(([p]) => p)).toEqual([]);
  });
});

describe("hero (library B5)", () => {
  it("caps heading and subheading at 680px and shows one action", () => {
    expect(css).toMatch(/--container-hero:\s*680px/);
    const html = renderToStaticMarkup(createElement(Hero, {
      title: "Read, sync and send", subtitle: "Sub", primaryCta: { href: "/sign-in", label: "Start free" },
      fields: [["To", "Backend teams"]], visual: createElement("div"),
    }));
    expect(html).toMatch(/<h1[^>]*class="[^"]*max-w-hero/);
    expect(html).toMatch(/<p class="[^"]*max-w-hero[^"]*">Sub<\/p>/);
    expect(html.match(/<a /g)?.length).toBe(1);
  });

  it("keeps a space before the heading line break so textContent reads correctly", () => {
    const page = readFileSync("src/app/(marketing)/page.tsx", "utf8");
    for (const m of page.matchAll(/(\S)\s*<br/g)) expect(m[1]).toBe("}"); // {" "}<br ...
  });
});

describe("copy has no hyphens (library B1)", () => {
  // Identifiers and sample data keep their hyphens: HTTP headers, example mailboxes and org slugs, plan names.
  const allowed = /Idempotency-Key|[\w.]+@[\w-]+\.example|northwind-crm|harbor-law|kestrel-ats|Self-host/g;
  const copyFields = /\b(?:pain|detail|title|body|q|a|text|subtitle|intro|label|note|linkLabel|proof)[=:]\s*"([^"]+)"/g;
  const jsxText = />([^<>{}]*[A-Za-z][^<>{}]*)</g;

  for (const [path, src] of marketing) {
    it(path, () => {
      const strings = [...src.matchAll(copyFields), ...src.matchAll(jsxText)].map((m) => m[1]!);
      const hyphenated = strings.map((s) => s.replace(allowed, "")).filter((s) => /[A-Za-z]-[A-Za-z]/.test(s) && !/=>|className|\(/.test(s));
      expect(hyphenated).toEqual([]);
    });
  }
});

describe("tagline reveal (library B11)", () => {
  it("renders one span per word, muted at first", () => {
    const text = "Nothing outsourced. Your users' mail is handled only by our code.";
    const html = renderToStaticMarkup(createElement(TaglineReveal, { text }));
    expect(html.match(/class="kit-word"/g)?.length).toBe(taglineWords(text).length);
    expect(html).toContain('data-on="false"');
    expect(html).toMatch(/max-w-hero/);
  });

  it("muted tone is 25 to 35% and reduced motion shows the final colour at once", () => {
    const muted = Number(css.match(/\.kit-word\s*\{\s*opacity:\s*([\d.]+)/)?.[1]);
    expect(muted).toBeGreaterThanOrEqual(0.25);
    expect(muted).toBeLessThanOrEqual(0.35);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.kit-word\s*\{\s*opacity:\s*1;\s*transition:\s*none/);
  });

  it("uses IntersectionObserver, not a scroll listener", () => {
    const src = readFileSync("src/components/marketing/tagline-reveal.tsx", "utf8");
    expect(src).toMatch(/new IntersectionObserver/);
    expect(src).not.toMatch(/addEventListener\("scroll"/);
  });

  it("is not directly under the hero", () => {
    const page = readFileSync("src/app/(marketing)/page.tsx", "utf8");
    const order = [...page.matchAll(/<(Hero|Problem|HowItWorks|TaglineReveal)\b/g)].map((m) => m[1]);
    expect(order.indexOf("TaglineReveal")).toBeGreaterThan(order.indexOf("Hero") + 1);
  });
});

describe("mobile menu stagger (library B7)", () => {
  it("steps 60ms and caps the sequence at 400ms", () => {
    expect([0, 1, 2, 6, 7, 20].map(menuDelay)).toEqual([0, 60, 120, 360, 400, 400]);
  });
});
