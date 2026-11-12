// Plain module (no "use client") so server pages and client components can both call it.
export function formatDate(d: string | number | Date | null | undefined, withTime = false): string {
  if (!d) return "Never";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }
    : { dateStyle: "medium", timeZone: "UTC" }).format(date) + (withTime ? " UTC" : "");
}
