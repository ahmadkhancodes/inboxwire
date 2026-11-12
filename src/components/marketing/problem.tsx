import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";

export interface ProblemItem {
  /** The pain in the buyer's own words. */
  pain: string;
  detail: ReactNode;
}

/** A numbered ledger: the pain in the buyer's words on the left, the answer on the right, ruled rows. */
export function Problem({ title, intro, items }: { title: ReactNode; intro?: ReactNode; items: ProblemItem[] }) {
  return (
    <Section field="Problem" labelledBy="problem-title" size="lg">
      <div className="flex max-w-3xl flex-col gap-4">
        <h2 id="problem-title" className="heading-4 md:heading-2 text-text">{title}</h2>
        {intro ? <p className="body-3 text-text-subtle md:title-2">{intro}</p> : null}
      </div>
      <ol className="mt-10 border-b border-border md:mt-12">
        {items.map((item, i) => (
          <li key={item.pain} className="grid gap-x-6 gap-y-2 border-t border-border py-6 md:grid-cols-10">
            <span aria-hidden className="font-mono caption-5 tabular-nums text-text-muted md:col-span-1 md:pt-1">{String(i + 1).padStart(2, "0")}</span>
            <p className="heading-6 text-text md:col-span-4">&ldquo;{item.pain}&rdquo;</p>
            <p className="body-3 text-text-subtle md:col-span-5">{item.detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
