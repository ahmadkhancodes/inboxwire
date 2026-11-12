// Structured JSON logs. Never log emails, tokens, codes or bodies (BACKEND_REUSE 1.11).
type Level = "debug" | "info" | "warn" | "error";
type Fields = { code?: string; route?: string; userId?: string; orgId?: string; [k: string]: unknown };

const SECRETISH = /(token|secret|password|passwd|authorization|cookie|email|mail|bearer|api[-_]?key|signature|dsn|credential)|^code$/i;
const EMAILISH = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g;

function scrubValue(v: unknown, depth: number): unknown {
  if (typeof v === "string") return v.replace(EMAILISH, "[email]").slice(0, 500);
  if (v && typeof v === "object" && depth < 4) {
    if (Array.isArray(v)) return v.slice(0, 20).map((x) => scrubValue(x, depth + 1));
    return scrub(v as Fields, depth + 1);
  }
  return v;
}

/** Redacts secret-looking keys (anywhere in the name, nested too) and e-mail addresses inside string values. `code` is an error code, kept. */
export function scrub(fields: Fields, depth = 0): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = SECRETISH.test(k) && k !== "code" ? "[redacted]" : scrubValue(v, depth);
  return out;
}

function emit(level: Level, msg: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" && level === "debug") return;
  const line = JSON.stringify({ level, msg, at: new Date().toISOString(), ...scrub(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Fields) => emit("debug", m, f),
  info: (m: string, f?: Fields) => emit("info", m, f),
  warn: (m: string, f?: Fields) => emit("warn", m, f),
  error: (m: string, f?: Fields) => emit("error", m, f),
};
