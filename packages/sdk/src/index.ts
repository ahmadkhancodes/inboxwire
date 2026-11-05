import { DEFAULT_BASE_URL, operations, type InboxwireClient, type OperationInfo } from "./generated";

export * from "./generated";
export { verifyWebhook, signWebhook } from "./webhook";

export class InboxwireError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly details?: unknown) {
    super(`${status} ${code}`);
    this.name = "InboxwireError";
  }
}

export interface ClientOptions {
  /** API key from the dashboard. Sent as `Authorization: Bearer`. */
  apiKey: string;
  /** Default: https://inboxwire.buffersoltech.com/v1. Point it at your own instance when you self-host. */
  baseUrl?: string;
  /** development, staging or production (default production). */
  environment?: "development" | "staging" | "production";
  fetch?: typeof fetch;
  /** Retries on 429 and 5xx for GET requests only (default 2). Sends are never retried unless you pass an idempotencyKey. */
  maxRetries?: number;
}

type Args = { query?: Record<string, unknown>; body?: unknown; idempotencyKey?: string } & Record<string, unknown>;

export function createClient(opts: ClientOptions): InboxwireClient {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const retries = opts.maxRetries ?? 2;

  async function call(op: OperationInfo, args: Args = {}): Promise<unknown> {
    let path: string = op.path;
    for (const p of op.pathParams) {
      const v = args[p];
      if (typeof v !== "string" || v === "") throw new TypeError(`missing path parameter: ${p}`);
      path = path.replace(`{${p}}`, encodeURIComponent(v));
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(args.query ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
    const url = `${base}${path}${qs.size ? `?${qs}` : ""}`;
    const headers: Record<string, string> = { authorization: `Bearer ${opts.apiKey}`, accept: op.binary ? "application/octet-stream" : "application/json" };
    if (opts.environment) headers["x-environment"] = opts.environment;
    if (op.hasBody) headers["content-type"] = "application/json";
    if (op.idempotent && args.idempotencyKey) headers["idempotency-key"] = args.idempotencyKey;
    const safeToRetry = op.method === "get" || (op.idempotent && !!args.idempotencyKey);
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(url, { method: op.method.toUpperCase(), headers, body: op.hasBody ? JSON.stringify(args.body) : undefined });
      if (res.ok) {
        if (op.binary) return res.arrayBuffer();
        const text = await res.text();
        return text ? JSON.parse(text) : undefined;
      }
      if (safeToRetry && attempt < retries && (res.status === 429 || res.status >= 500)) {
        const wait = Number(res.headers.get("retry-after")) || 2 ** attempt * 0.5;
        await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
        continue;
      }
      let body: { error?: string; details?: unknown } = {};
      try { body = (await res.json()) as typeof body; } catch { /* not JSON */ }
      throw new InboxwireError(res.status, body.error ?? "error", body.details);
    }
  }

  return Object.fromEntries(Object.entries(operations).map(([id, op]) => [id, (args?: Args) => call(op, args)])) as unknown as InboxwireClient;
}
