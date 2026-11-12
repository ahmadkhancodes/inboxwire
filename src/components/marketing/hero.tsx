import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export interface HeroProps {
  title: ReactNode;
  subtitle: ReactNode;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  proof?: ReactNode;
  /** Message header rows above the subject line, e.g. ["To", "Backend teams"]. The H1 is always the "Subject". */
  fields?: [string, ReactNode][];
  /** The REAL product UI. Full width under the claim; cropped by its own container on mobile. */
  visual: ReactNode;
}

const label = "font-mono caption-5 text-text-muted lg:col-span-2 lg:pt-1";

/**
 * Hero set as a message header (docs/design-brief.md signature): field rows in mono, the H1 is the subject,
 * then one action and the proof line. The product UI runs full width below on a ruled band.
 */
export function Hero({ title, subtitle, primaryCta, secondaryCta, proof, fields = [], visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface">
      <Container className="pb-12 pt-8 md:pb-16 md:pt-16">
        <dl className="m-0 border-b border-border">
          {fields.map(([k, v]) => (
            <div key={k} className="grid gap-x-6 border-t border-border py-2 first:border-t-0 lg:grid-cols-12">
              <dt className={label}>{k}:</dt>
              <dd className="m-0 body-6 text-text-subtle lg:col-span-10">{v}</dd>
            </div>
          ))}
          <div className="grid gap-x-6 gap-y-2 border-t border-border py-6 md:py-8 lg:grid-cols-12">
            <dt className={label}>Subject:</dt>
            <dd className="m-0 lg:col-span-10">
              <h1 id="hero-title" className="heading-4 sm:heading-3 md:heading-2 lg:heading-1 max-w-5xl text-text" style={{ lineHeight: 1.12 }}>{title}</h1>
            </dd>
          </div>
        </dl>
        <div className="grid gap-6 pt-6 md:pt-8 lg:grid-cols-12 lg:gap-x-6">
          <p className="body-3 max-w-2xl text-text-subtle md:title-2 lg:col-span-6 lg:col-start-3">{subtitle}</p>
          <div className="flex flex-col items-start gap-4 lg:col-span-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}</ButtonLink>
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center button-md text-text underline decoration-border-strong decoration-2 underline-offset-4 transition-colors duration-300 ease-out-kit hover:decoration-text focus-visible:focus-ring">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
            {proof ? <div className="caption-2 text-text-subtle">{proof}</div> : null}
          </div>
        </div>
      </Container>
      <div className="border-y border-border bg-surface-sunken py-8 md:py-12">
        <Container>{visual}</Container>
      </div>
    </section>
  );
}
