import type { Page } from "@playwright/test";

/** Layout, light-only, font and contrast scan of the current page. Returns human readable problems. */
export async function scanPage(page: Page): Promise<string[]> {
  return page.evaluate(() => {
        const out: string[] = [];
        const html = document.documentElement;
        if (html.scrollWidth - innerWidth > 0) out.push(`horizontal scroll ${html.scrollWidth - innerWidth}px`);
        if (html.dataset.theme || html.classList.contains("dark")) out.push("theme attribute/class left on <html>");
        if (document.querySelector("[class*='dark:'], [data-theme-toggle], [aria-label*='theme' i]")) out.push("dark-mode leftovers in DOM");
        if (!document.querySelector("h1")) out.push("no h1");
        const families = new Set<string>();
        const clipped: string[] = [];
        const lowContrast: string[] = [];
        const parse = (c: string) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const [r, g, b, a = "1"] = m[1]!.split(/[ ,/]+/).filter(Boolean); return [+r!, +g!, +b!, +a]; };
        const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!); };
        for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (el.closest(".sr-only, [aria-hidden=true]")) continue;
          families.add(cs.fontFamily.split(",")[0]!.trim().replace(/"/g, ""));
          const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1);
          if (!ownText) continue;
          if (/hidden|clip/.test(cs.overflowX) && el.scrollWidth - el.clientWidth > 2 && cs.textOverflow !== "ellipsis") clipped.push(`${el.tagName} "${el.textContent!.trim().slice(0, 30)}"`);
          // contrast against the first opaque ancestor background (skip gradients/images)
          let bg: number[] | null = null; let node: HTMLElement | null = el; let skip = false;
          while (node) { const s = getComputedStyle(node); if (s.backgroundImage !== "none") { skip = true; break; } const c = parse(s.backgroundColor); if (c && c[3]! >= 0.99) { bg = c; break; } node = node.parentElement; }
          const fg = parse(cs.color);
          if (skip || !bg || !fg) continue;
          const a = fg[3]!; const mixed = [0, 1, 2].map((i) => fg[i]! * a + bg![i]! * (1 - a));
          const l1 = lum(mixed), l2 = lum(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
          if (ratio < (large ? 3 : 4.5) - 0.01) lowContrast.push(`${ratio.toFixed(1)} "${el.textContent!.trim().slice(0, 25)}"`);
        }
        const oldFont = [...families].filter((f) => /chivo|inter$|geist|space grotesk|dm sans|manrope|poppins/i.test(f));
        if (oldFont.length) out.push(`old fonts: ${oldFont}`);
        if (clipped.length) out.push(`clipped text: ${clipped.slice(0, 4)}`);
        if (lowContrast.length) out.push(`low contrast: ${[...new Set(lowContrast)].slice(0, 4)}`);
        const cs = getComputedStyle(html); if (cs.colorScheme !== "light") out.push(`color-scheme ${cs.colorScheme}`);
        return out;
      });
}
