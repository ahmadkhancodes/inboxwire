import type { ReactNode } from "react";
import { cn } from "./cn";

/** Skeleton shaped like the real layout (no circular spinners for content). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("bg-surface-sunken motion-safe:animate-pulse", className)} />;
}

/** Composed getting-started view that teaches the next action. */
export function EmptyState({ title, body, action, visual, example }: { title: string; body: ReactNode; action?: ReactNode; visual?: ReactNode; example?: ReactNode }) {
  return (
    <div className="grid border border-dashed border-border-strong bg-surface md:grid-cols-2">
      <div className="flex flex-col items-start gap-4 p-6 md:p-8">
        <p className="font-mono caption-5 text-text-muted">Nothing here yet</p>
        <div className="flex max-w-xl flex-col gap-2">
          <h3 className="heading-6 text-text">{title}</h3>
          <div className="body-6 text-text-subtle">{body}</div>
        </div>
        {action}
      </div>
      {visual || example ? (
        <div className="min-w-0 border-t border-dashed border-border-strong bg-surface-sunken p-6 md:border-l md:border-t-0 md:p-8">
          <p className="mb-2 font-mono caption-5 text-text-muted">What it will look like</p>
          {visual ?? <div className="font-mono caption-5 text-text-subtle">{example}</div>}
        </div>
      ) : null}
    </div>
  );
}

/** Inline, specific error: what failed and what to do next. */
export function ErrorState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border border-danger bg-danger-surface p-6">
      <h3 className="title-3 text-danger">{title}</h3>
      <div className="body-6 text-text">{body}</div>
      {action}
    </div>
  );
}

type Tone = "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  info: "border-border bg-surface-sunken text-text",
  success: "border-success bg-surface text-text [&_.notice-title]:text-success",
  warning: "border-warning bg-surface text-text [&_.notice-title]:text-warning",
  danger: "border-danger bg-surface text-text [&_.notice-title]:text-danger",
};

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex flex-col gap-2 border p-4 sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div className="flex flex-col gap-1">
        {title ? <p className="notice-title title-4">{title}</p> : null}
        {children ? <div className="body-6 text-text-subtle">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const t: Record<Tone, string> = {
    info: "border-border text-text-subtle",
    success: "border-success text-success",
    warning: "border-warning text-warning",
    danger: "border-danger text-danger",
  };
  return <span className={cn("inline-flex items-center rounded-sm border px-2 py-0.5 font-mono caption-5", t[tone])}>{children}</span>;
}
