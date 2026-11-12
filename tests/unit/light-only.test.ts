import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|html|mdx?)$/.test(f)) out.push(p);
  }
  return out;
}
const files = walk("src").map((p) => [p, readFileSync(p, "utf8")] as const);

describe("light only (no dark mode)", () => {
  const forbidden: [string, RegExp][] = [
    ["dark: utility", /(^|[\s"'`{])(?:[a-z0-9-]+:)*dark:[a-z\[!-]/],
    ["prefers-color-scheme: dark", /prefers-color-scheme:\s*dark/],
    ["data-theme", /data-theme|dataset\.theme/],
    ["dark token set / variant", /\.dark\b|@custom-variant\s+dark|color-scheme:\s*dark/],
    ["theme toggle / init script", /ThemeToggle|themeInitScript|theme-script|localStorage\.(get|set)Item\(["']theme/],
  ];
  for (const [name, re] of forbidden) {
    it(`src has no ${name}`, () => {
      expect(files.filter(([, c]) => re.test(c)).map(([p]) => p)).toEqual([]);
    });
  }
  it("globals.css declares color-scheme: light", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/color-scheme:\s*light/);
  });
});
