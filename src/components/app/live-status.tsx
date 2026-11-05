import type { LiveMode } from "./use-live";

export function LiveStatus({ mode }: { mode: LiveMode }) {
  const text = mode === "live" ? "Live: updates arrive as they happen" : mode === "polling" ? "Polling every 5 seconds" : "Connecting";
  return <p role="status" className="caption-2 text-text-subtle">{mode === "live" ? "● " : mode === "polling" ? "◐ " : "○ "}{text}</p>;
}
