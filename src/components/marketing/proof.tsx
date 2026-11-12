import Link from "next/link";
import { Section } from "@/components/ui/layout";

/** Proof slot. Ships with visible placeholders: never replace them with invented quotes. */
export function Proof({
  quote = "{{testimonial}}", name = "{{name}}", role = "{{role, company}}",
}: { quote?: string; name?: string; role?: string }) {
  return (
    <Section tone="raised" labelledBy="proof-title">
      <h2 id="proof-title" className="sr-only">What customers say</h2>
      <figure className="grid gap-6 lg:grid-cols-12 lg:gap-16">
        <blockquote className="heading-5 md:heading-3 text-text lg:col-span-8">&ldquo;{quote}&rdquo;</blockquote>
        <figcaption className="flex flex-col gap-1 border-t border-border pt-6 lg:col-span-4 lg:self-end lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <span className="title-3 text-text">{name}</span>
          <span className="body-6 text-text-subtle">{role}</span>
        </figcaption>
      </figure>
    </Section>
  );
}

export interface ProofFact {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}

/**
 * Social proof without invented quotes, logos or numbers: facts a visitor can verify on the site today.
 * Swap in real customer quotes (Proof above) once they exist.
 */
export function ProofFacts({ title, items }: { title: string; items: ProofFact[] }) {
  return (
    <Section field="Proof" labelledBy="proof-facts-title">
      <h2 id="proof-facts-title" className="heading-4 md:heading-3 max-w-3xl text-text">{title}</h2>
      <ul className="mt-8 grid border-b border-border md:mt-10 md:grid-cols-3 md:gap-x-6">
        {items.map((f) => (
          <li key={f.title} className="flex flex-col gap-2 border-t border-text py-6">
            <h3 className="title-2 text-text">{f.title}</h3>
            <p className="body-3 text-text-subtle">{f.body}</p>
            <Link href={f.href} className="inline-flex min-h-11 w-fit items-center button-sm text-text underline decoration-border-strong decoration-2 underline-offset-4 transition-colors duration-300 ease-out-kit hover:decoration-text focus-visible:focus-ring">{f.linkLabel}</Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
