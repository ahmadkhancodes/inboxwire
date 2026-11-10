import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { metadata as home } from "@/app/(marketing)/page";
import { metadata as pricing } from "@/app/(marketing)/pricing/page";
import { metadata as casa } from "@/app/(marketing)/casa/page";
import { metadata as status } from "@/app/(marketing)/status/page";
import { metadata as compare } from "@/app/(marketing)/compare/page";
import { generateMetadata as compareSlug } from "@/app/(marketing)/compare/[slug]/page";
import { pageMetadata, ogImageUrl } from "@/lib/seo";
import sitemap from "@/app/sitemap";
import { product } from "@/config/product";
import { comparisons } from "@/content/compare";

const imgUrl = (x: unknown) => {
  const first = (Array.isArray(x) ? x[0] : x) as string | { url: string };
  return typeof first === "string" ? first : first.url;
};

describe("share images on every page that sets openGraph", () => {
  const expected = `${product.url}/opengraph-image`;
  it("builds an absolute url", () => expect(ogImageUrl()).toBe(expected));
  it("emits og:image and twitter:image", async () => {
    const slug = await compareSlug({ params: Promise.resolve({ slug: comparisons[0]!.slug }) });
    const all = [home, pricing, casa, status, compare, slug, pageMetadata({ title: "x", description: "y", path: "/x" })];
    for (const m of all) {
      expect(imgUrl(m.openGraph?.images)).toBe(expected);
      expect(imgUrl(m.twitter?.images)).toBe(expected);
    }
  });
});

describe("favicon and compare nav", () => {
  it("redirects /favicon.ico to /icon", async () => {
    const r = await nextConfig.redirects!();
    expect(r).toContainEqual({ source: "/favicon.ico", destination: "/icon", permanent: true });
  });
  it("every header nav link has a page or is in the sitemap", () => {
    const urls = sitemap().map((s) => s.url.replace(product.url, ""));
    for (const n of product.nav) expect(urls).toContain(n.href);
  });
  it("footer links resolve to sitemap entries", async () => {
    const src = (await import("node:fs")).readFileSync("src/components/marketing/site-footer.tsx", "utf8");
    const urls = sitemap().map((s) => s.url.replace(product.url, ""));
    for (const m of src.matchAll(/href: "(\/[^"]*)"/g)) expect(urls).toContain(m[1]);
  });
});
