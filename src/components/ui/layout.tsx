import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/**
 * Marketing section. Rhythm varies on purpose (docs/design-brief.md): `size` picks the vertical padding,
 * `tone` the surface, `field` puts a mono "header field" label in a 2 column gutter on the left.
 */
export function Section({
  id, tone = "base", size = "md", field, ruled = true, className, children, labelledBy,
}: {
  id?: string; tone?: "base" | "raised" | "sunken" | "inverse"; size?: "sm" | "md" | "lg"; field?: string; ruled?: boolean;
  className?: string; children: ReactNode; labelledBy?: string;
}) {
  const t = { base: "bg-surface", raised: "bg-surface-raised", sunken: "bg-surface-sunken", inverse: "bg-surface-inverse text-text-inverse" }[tone];
  const pad = { sm: "py-12 md:py-16", md: "py-12 md:py-20", lg: "py-16 md:py-24" }[size];
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(t, className)}>
      <Container className={cn(pad, ruled && tone !== "inverse" && "border-t border-border")}>
        {field ? (
          <div className="grid gap-x-6 gap-y-4 lg:grid-cols-12">
            <p className={cn("font-mono caption-5 lg:col-span-2 lg:pt-2", tone === "inverse" ? "text-text-inverse/70" : "text-text-muted")}>{field}:</p>
            <div className="min-w-0 lg:col-span-10">{children}</div>
          </div>
        ) : children}
      </Container>
    </section>
  );
}
