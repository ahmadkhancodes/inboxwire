import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";

/** Closing block on the ink band: the same action as the hero, plus the docs beside it. */
export function FinalCta({ title, body, cta, note }: { title: ReactNode; body?: ReactNode; cta: { href: string; label: string }; note?: ReactNode }) {
  return (
    <Section tone="inverse" size="lg" labelledBy="final-cta-title">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-x-6">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <h2 id="final-cta-title" className="heading-4 md:heading-2 max-w-3xl">{title}</h2>
          {body ? <p className="body-3 max-w-2xl text-text-inverse/80">{body}</p> : null}
        </div>
        <div className="flex flex-col items-start gap-3 lg:col-span-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ButtonLink href={cta.href} size="lg" variant="mark">{cta.label}</ButtonLink>
            <Link href="/docs" className="inline-flex min-h-11 items-center button-md underline decoration-2 underline-offset-4 focus-visible:outline-text-inverse">Read the docs</Link>
          </div>
          {note ? <p className="caption-2 text-text-inverse/80">{note}</p> : null}
        </div>
      </div>
    </Section>
  );
}
