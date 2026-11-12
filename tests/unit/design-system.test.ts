import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { Hero } from "@/components/marketing/hero";

// docs/design-brief.md (12 Nov 2026 redesign): guards against sliding back into the old "AI template" look.
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
}
const files = walk("src").map((p) => [p, readFileSync(p, "utf8")] as const);
const css = readFileSync("src/app/globals.css", "utf8");

describe("design system (docs/design-brief.md)", () => {
  it("loads the IBM Plex superfamily through next/font and nothing else", () => {
    const fonts = readFileSync("src/app/fonts.ts", "utf8");
    expect(fonts).toMatch(/IBM_Plex_Sans_Condensed/);
    expect(fonts).toMatch(/IBM_Plex_Sans\b/);
    expect(fonts).toMatch(/IBM_Plex_Mono/);
    expect(files.filter(([, c]) => /\b(Chivo|Public_Sans|Martian_Mono|Inter|Geist|Space_Grotesk)\b/.test(c)).map(([p]) => p)).toEqual([]);
  });

  it("uses ink as the action colour and the highlighter as the only accent (no amber, no indigo)", () => {
    expect(css).toMatch(/--mark:\s*#d9f45b/i);
    expect(css).toMatch(/--action-text:\s*#ffffff/i);
    expect(files.filter(([, c]) => /#f5a524|#e08f0b|indigo-|violet-|purple-/i.test(c)).map(([p]) => p)).toEqual([]);
  });

  it("keeps structure square: lg and larger radii are 0", () => {
    for (const r of ["lg", "xl", "2xl", "3xl"]) expect(css).toMatch(new RegExp(`--radius-${r}:\\s*0px`));
  });

  it("has no glassmorphism or background gradients in components", () => {
    expect(files.filter(([, c]) => /backdrop-blur|bg-gradient-|bg-linear-/.test(c)).map(([p]) => p)).toEqual([]);
  });

  it("app navigation is a text index without an icon per item", () => {
    const shell = readFileSync("src/components/app/app-shell.tsx", "utf8");
    expect(shell).not.toMatch(/icon:\s*[A-Z]/);
    expect(shell).toMatch(/label: "Mail"/);
    expect(shell).toMatch(/label: "Developers"/);
    expect(shell).toMatch(/label: "Account"/);
  });

  it("empty states show a realistic example next to the next action", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { title: "No lines yet", body: "Create a connect link.", example: "ops@northwind-crm.example · live" }));
    expect(html).toContain("What it will look like");
    expect(html).toContain("ops@northwind-crm.example");
    expect(renderToStaticMarkup(createElement(EmptyState, { title: "x", body: "y" }))).not.toContain("What it will look like");
  });

  it("page header renders the mono location field above the title", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { title: "Lines", field: "Mail / lines" }));
    expect(html.indexOf("Mail / lines")).toBeLessThan(html.indexOf("<h1"));
  });

  it("hero is a message header: field rows, then the H1 as the subject", () => {
    const html = renderToStaticMarkup(createElement(Hero, {
      title: "Read, sync and send", subtitle: "s", primaryCta: { href: "/sign-in", label: "Start free" },
      fields: [["To", "Backend teams"]], visual: createElement("div"),
    }));
    expect(html).toContain("To:");
    expect(html.indexOf("Subject:")).toBeLessThan(html.indexOf("<h1"));
    expect(html).toContain("Start free");
  });
});
