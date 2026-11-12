import type { ReactNode } from "react";
import { Container } from "@/components/ui/layout";

/** Inner-page header in the message-header style: optional field rows, the H1 as the subject, one line under it. */
export function PageIntro({ title, lead, fields = [], aside }: { title: ReactNode; lead?: ReactNode; fields?: [string, ReactNode][]; aside?: ReactNode }) {
  return (
    <Container className="pt-8 md:pt-16">
      <dl className="m-0 border-b border-border">
        {fields.map(([k, v]) => (
          <div key={k} className="grid gap-x-6 border-t border-border py-2 first:border-t-0 lg:grid-cols-12">
            <dt className="font-mono caption-5 text-text-muted lg:col-span-2">{k}:</dt>
            <dd className="m-0 body-6 text-text-subtle lg:col-span-10">{v}</dd>
          </div>
        ))}
        <div className="grid gap-x-6 gap-y-2 border-t border-border py-6 first:border-t-0 lg:grid-cols-12">
          <dt className="font-mono caption-5 text-text-muted lg:col-span-2 lg:pt-2">Subject:</dt>
          <dd className="m-0 flex flex-col gap-4 lg:col-span-10 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
            <div className="flex max-w-3xl flex-col gap-3">
              <h1 className="heading-4 md:heading-2 text-text">{title}</h1>
              {lead ? <p className="body-3 text-text-subtle">{lead}</p> : null}
            </div>
            {aside}
          </dd>
        </div>
      </dl>
    </Container>
  );
}
