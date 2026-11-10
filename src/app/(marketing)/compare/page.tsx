import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/layout";
import { comparisons } from "@/content/compare";
import { pageMetadata } from "@/lib/seo";
import { product } from "@/config/product";

export const metadata = pageMetadata({
  title: "Compare",
  description: `How ${product.name} compares with other email sync APIs, with dated prices and a note on where each one is the better fit.`,
  path: "/compare",
});

export default function CompareIndexPage() {
  return (
    <Section labelledBy="compare-index-title">
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 id="compare-index-title" className="hero-gradient-text heading-3 md:heading-1">Compare {product.name}</h1>
        <p className="body-3 text-text-subtle md:title-1">Side-by-side facts, with the cases where the other tool wins listed first.</p>
      </div>
      <ul className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2">
        {comparisons.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/compare/${c.slug}`}
              className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-surface-raised p-6 transition-colors duration-300 ease-out-kit hover:border-text-subtle focus-visible:focus-ring"
            >
              <h2 className="title-3">{product.name} vs {c.competitor}</h2>
              <p className="body-5 text-text-subtle">{c.description}</p>
              <span className="body-6 mt-auto inline-flex items-center gap-2 pt-2">
                Read the comparison <ArrowRight aria-hidden size={16} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
