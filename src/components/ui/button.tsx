import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Buttons (playbook §7 states): primary (ink), secondary (outline), tertiary, danger, mark (on ink only). Hover/active/focus/disabled/loading.
type Variant = "primary" | "secondary" | "tertiary" | "danger" | "mark";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm whitespace-nowrap select-none transition-[background-color,color,border-color,opacity,transform] duration-300 ease-out-kit active:scale-[0.98] disabled:opacity-50 aria-busy:cursor-progress focus-visible:focus-ring";
const variants: Record<Variant, string> = {
  primary: "bg-action text-action-text hover:bg-action-hover",
  secondary: "border border-border-strong bg-surface text-text hover:border-text",
  tertiary: "text-text-subtle hover:text-text hover:bg-surface-sunken",
  /** Highlighter button, only on the ink band (final CTA) where an ink button would vanish. */
  mark: "bg-mark text-text hover:bg-white",
  danger: "bg-danger text-white hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "button-sm min-h-11 px-3 py-1 sm:min-h-8",
  md: "button-md min-h-11 px-3 py-2",
  lg: "button-lg min-h-12 px-4 py-3",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary", size = "md", loading, className, children, ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button aria-busy={loading || undefined} disabled={rest.disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <span aria-hidden className="size-4 rounded-full border-2 border-current border-r-transparent opacity-70 motion-safe:animate-spin" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href, variant = "primary", size = "md", className, children, ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...rest}>{children}</Link>;
}
