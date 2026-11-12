import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { magicLinkEmail, otpEmail } from "@/lib/mail/templates";

const read = (p: string) => readFileSync(p, "utf8");

describe("post-redesign brand consistency", () => {
  it("e-mails use the carbon ramp and square corners, not the old greys or rounding", () => {
    for (const { html } of [magicLinkEmail("https://x.test/a"), otpEmail("123456")]) {
      expect(html).not.toMatch(/#181818|#767676|#404040|#f7f7f7|#e2e2e2|border-radius:(6|8)px/i);
      expect(html).toContain("#101418");
    }
  });
  it("OG image and icons use ink #101418 with no rounded tile", () => {
    for (const f of ["opengraph-image", "icon", "apple-icon"]) {
      const src = read(`src/app/${f}.tsx`);
      expect(src, f).not.toContain("#181818");
      expect(src, f).not.toMatch(/borderRadius: (6|12)\b/);
    }
  });
  it("global-error carries the same font variables as the root layout", () => {
    const src = read("src/app/global-error.tsx");
    expect(src).toContain("display.variable");
    expect(src).toContain("sans.variable");
  });
});
