import { cn } from "./cn";

export type LampState = "live" | "syncing" | "error" | "throttled" | "idle";

const LABEL: Record<LampState, string> = { live: "live", syncing: "syncing", error: "auth error", throttled: "throttled", idle: "connecting" };

/** Lamp + text label + shape (circle live, half syncing, square error): never colour only (WCAG 1.4.1). */
export function StatusLamp({ state, label, className }: { state: LampState; label?: string; className?: string }) {
  const text = label ?? LABEL[state];
  const base = { width: 10, height: 10, display: "inline-block", flexShrink: 0 } as const;
  const lamp =
    state === "live" ? <span aria-hidden style={{ ...base, borderRadius: 999 }} className="bg-success ring-4 ring-success-surface" /> :
    state === "syncing" ? <span aria-hidden style={{ ...base, borderRadius: 999, background: "linear-gradient(90deg, var(--action) 50%, transparent 50%)" }} className="border border-action" /> :
    state === "throttled" ? <span aria-hidden style={{ ...base, borderRadius: 999 }} className="border border-warning bg-warning-surface" /> :
    state === "error" ? <span aria-hidden style={base} className="bg-danger" /> :
    <span aria-hidden style={{ ...base, borderRadius: 999 }} className="border border-border-strong" />;
  return <span className={cn("inline-flex items-center gap-2 whitespace-nowrap body-6 text-text", className)}>{lamp}{text}</span>;
}
