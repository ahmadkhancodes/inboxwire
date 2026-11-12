/** One CSV cell. Cells that start with = + - @ tab or CR get a leading quote so a spreadsheet never runs them as a formula. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = ["id", "eventId", "event", "status", "attempts", "lastStatusCode", "lastError", "lastLatencyMs", "createdAt", "nextAttemptAt", "replayOf"] as const;

export function deliveriesCsv(rows: Record<string, unknown>[]): string {
  return [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}
