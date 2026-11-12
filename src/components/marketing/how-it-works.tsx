import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";
import { Reveal } from "@/components/ui/reveal";

export interface Step {
  title: string;
  body: ReactNode;
  /** A UI fragment or code sample, not an icon. */
  visual: ReactNode;
}

/** A transcript: each step is one ruled row, the words on the left and what actually happens on the right. */
export function HowItWorks({ title, steps }: { title: ReactNode; steps: Step[] }) {
  return (
    <Section field="Flow" labelledBy="how-title" tone="sunken" size="lg">
      <h2 id="how-title" className="heading-4 md:heading-2 max-w-3xl text-text">{title}</h2>
      <ol className="mt-10 md:mt-12">
        {steps.map((step, i) => (
          <li key={step.title} className="border-t border-border-strong py-8 last:pb-0">
            <Reveal className="grid gap-6 lg:grid-cols-10 lg:gap-x-6">
              <div className="flex flex-col gap-2 lg:col-span-4">
                <p aria-hidden className="font-mono caption-5 text-text-muted">Step {i + 1} of {steps.length}</p>
                <h3 className="heading-5 text-text"><span className="sr-only">Step {i + 1}: </span>{step.title}</h3>
                <p className="body-3 text-text-subtle">{step.body}</p>
              </div>
              <div className="min-w-0 lg:col-span-6">{step.visual}</div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
