import type { ReactNode } from "react";

/**
 * Screen header (docs/design-brief.md §7): a mono "field" line for where you are, the condensed title,
 * one sentence, and at most one primary action on the right. Ruled underneath.
 */
export function PageHeader({ title, description, actions, field }: { title: string; description?: ReactNode; actions?: ReactNode; field?: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-2xl flex-col gap-2">
        {field ? <p className="font-mono caption-5 text-text-muted">{field}</p> : null}
        <h1 className="heading-4 text-text [overflow-wrap:anywhere]">{title}</h1>
        {description ? <p className="body-6 text-text-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Titled block inside a page: a square ruled panel with a sunken header row and a body. */
export function Panel({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col border border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border bg-surface-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex max-w-xl flex-col gap-1">
          <h2 className="title-3 text-text">{title}</h2>
          {description ? <p className="body-6 text-text-subtle">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}
