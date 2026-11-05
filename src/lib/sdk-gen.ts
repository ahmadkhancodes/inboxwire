// Generates the TypeScript SDK source (packages/sdk/src/generated.ts) from the OpenAPI 3.1 document.
// `npm run sdk:generate` writes it; tests/unit/sdk.test.ts fails when the committed file is out of date.

type J = Record<string, unknown>;
const get = (o: unknown, k: string) => (o as J | undefined)?.[k];

const ident = (s: string) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : JSON.stringify(s));
/** Type name for a component schema. `Error` would shadow the global, so it becomes `ApiError`. */
const pascal = (s: string) => (s === "Error" ? "ApiError" : s.charAt(0).toUpperCase() + s.slice(1));

/** JSON Schema (the subset our Zod schemas produce) to a TypeScript type expression. */
export function tsType(s: J | undefined, indent = ""): string {
  if (!s || Object.keys(s).length === 0) return "unknown";
  if (typeof s.$ref === "string") return pascal(s.$ref.split("/").pop()!);
  if ("const" in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return (s.enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(s.anyOf) || Array.isArray(s.oneOf)) return ((s.anyOf ?? s.oneOf) as J[]).map((x) => tsType(x, indent)).join(" | ");
  if (Array.isArray(s.allOf)) return (s.allOf as J[]).map((x) => tsType(x, indent)).join(" & ");
  const t = s.type;
  if (Array.isArray(t)) return t.map((x) => tsType({ ...s, type: x }, indent)).join(" | ");
  if (t === "string") return "string";
  if (t === "number" || t === "integer") return "number";
  if (t === "boolean") return "boolean";
  if (t === "null") return "null";
  if (t === "array") return `${wrap(tsType(s.items as J, indent))}[]`;
  if (t === "object" || s.properties) {
    const props = (s.properties ?? {}) as Record<string, J>;
    const req = new Set((s.required ?? []) as string[]);
    const lines = Object.entries(props).map(([k, v]) => `${indent}  ${ident(k)}${req.has(k) ? "" : "?"}: ${tsType(v, indent + "  ")};`);
    const extra = s.additionalProperties;
    if (extra && typeof extra === "object") lines.push(`${indent}  [key: string]: ${tsType(extra as J, indent + "  ")};`);
    else if (extra === true && lines.length === 0) return "Record<string, unknown>";
    return lines.length ? `{\n${lines.join("\n")}\n${indent}}` : "Record<string, never>";
  }
  return "unknown";
}
const wrap = (t: string) => (/[|&]/.test(t) && !t.startsWith("{") ? `(${t})` : t);

interface Param { name: string; in: string; required?: boolean; schema?: J }

export function generateSdk(doc: J, defaultBase = "https://inboxwire.buffersoltech.com/v1"): string {
  const schemas = (get(get(doc, "components"), "schemas") ?? {}) as Record<string, J>;
  const paths = (doc.paths ?? {}) as Record<string, Record<string, J>>;
  const out: string[] = [
    "// GENERATED from /v1/openapi.json by `npm run sdk:generate`. Do not edit by hand.",
    "",
    `export const DEFAULT_BASE_URL = ${JSON.stringify(defaultBase)};`,
    "",
  ];
  for (const [name, s] of Object.entries(schemas)) out.push(`export type ${pascal(name)} = ${tsType(s)};`, "");

  const ops: { id: string; method: string; path: string; summary: string; scope: string; pathParams: string[]; query: Param[]; hasBody: boolean; idempotent: boolean; binary: boolean; body?: J; response?: J; causes: string[] }[] = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(item)) {
      const params = (op.parameters ?? []) as Param[];
      const ok = Object.entries((op.responses ?? {}) as Record<string, J>).find(([code]) => /^2/.test(code));
      const content = get(ok?.[1], "content") as Record<string, J> | undefined;
      const json = content?.["application/json"];
      ops.push({
        id: op.operationId as string, method, path, summary: op.summary as string, scope: op["x-required-scope"] as string,
        pathParams: params.filter((p) => p.in === "path").map((p) => p.name), query: params.filter((p) => p.in === "query"),
        hasBody: !!op.requestBody, idempotent: params.some((p) => p.in === "header" && p.name === "Idempotency-Key"),
        binary: !!content && !json, body: get(get(get(op.requestBody, "content"), "application/json"), "schema") as J | undefined,
        response: get(json, "schema") as J | undefined, causes: (op["x-causes-webhooks"] ?? []) as string[],
      });
    }
  }

  out.push("export interface OperationInfo {", "  method: \"get\" | \"post\" | \"patch\" | \"delete\";", "  path: string;", "  pathParams: readonly string[];", "  query: readonly string[];", "  hasBody: boolean;", "  idempotent: boolean;", "  binary: boolean;", "  scope: \"read\" | \"send\" | \"admin\";", "}", "");
  out.push("export const operations = {");
  for (const o of ops) {
    out.push(`  ${o.id}: { method: ${JSON.stringify(o.method)}, path: ${JSON.stringify(o.path)}, pathParams: ${JSON.stringify(o.pathParams)}, query: ${JSON.stringify(o.query.map((q) => q.name))}, hasBody: ${o.hasBody}, idempotent: ${o.idempotent}, binary: ${o.binary}, scope: ${JSON.stringify(o.scope)} },`);
  }
  out.push("} as const satisfies Record<string, OperationInfo>;", "");

  out.push("export interface InboxwireClient {");
  for (const o of ops) {
    const fields: string[] = [];
    for (const p of o.pathParams) fields.push(`${ident(p)}: string;`);
    if (o.query.length) fields.push(`query${o.query.some((q) => q.required) ? "" : "?"}: {\n${o.query.map((q) => `      ${ident(q.name)}${q.required ? "" : "?"}: ${tsType(q.schema)};`).join("\n")}\n    };`);
    if (o.hasBody) fields.push(`body: ${tsType(o.body, "    ")};`);
    if (o.idempotent) fields.push("idempotencyKey?: string;");
    const arg = fields.length ? `args${o.pathParams.length || o.hasBody || o.query.some((q) => q.required) ? "" : "?"}: {\n    ${fields.join("\n    ")}\n  }` : "";
    const ret = o.binary ? "ArrayBuffer" : o.response ? tsType(o.response) : "void";
    out.push(`  /** ${o.summary}. Scope: ${o.scope}.${o.causes.length ? ` Can cause: ${o.causes.join(", ")}.` : ""} */`, `  ${o.id}(${arg}): Promise<${ret}>;`);
  }
  out.push("}", "");
  return out.join("\n");
}
