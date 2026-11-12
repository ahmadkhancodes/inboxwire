import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";

export interface Feature {
  title: string;
  body: ReactNode;
  /** Optional real UI fragment. Only the lead item should have one. */
  visual?: ReactNode;
}

/** A spec sheet: the lead capability with its real UI, then a ruled two column definition list. No card grid. */
export function Features({ title, intro, items }: { title: ReactNode; intro?: ReactNode; items: Feature[] }) {
  const [lead, ...rest] = items;
  return (
    <Section field="Spec" labelledBy="features-title" size="lg">
      <div className="flex max-w-3xl flex-col gap-4">
        <h2 id="features-title" className="heading-4 md:heading-2 text-text">{title}</h2>
        {intro ? <p className="body-3 text-text-subtle">{intro}</p> : null}
      </div>
      {lead ? (
        <div className="mt-10 grid gap-6 border-t border-text pt-6 md:mt-12 lg:grid-cols-10 lg:gap-x-6">
          <div className="flex flex-col gap-2 lg:col-span-4">
            <h3 className="heading-5 text-text"><span className="bg-mark px-1">{lead.title}</span></h3>
            <p className="body-3 text-text-subtle">{lead.body}</p>
          </div>
          {lead.visual ? <div className="min-w-0 border border-border-strong lg:col-span-6">{lead.visual}</div> : null}
        </div>
      ) : null}
      <dl className="mt-8 grid border-b border-border md:grid-cols-2 md:gap-x-6">
        {rest.map((f) => (
          <div key={f.title} className="flex flex-col gap-1 border-t border-border py-6">
            <dt className="title-2 text-text">{f.title}</dt>
            <dd className="m-0 body-3 text-text-subtle">{f.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
