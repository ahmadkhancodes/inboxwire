/**
 * Copy-paste snippets personalised with the user's real base URL, key and ids. Pure functions so the exact text the
 * dashboard shows is unit tested and executed against the running app in tests/e2e/docs-run.spec.ts.
 */
export type SnippetScope = "read" | "send" | "admin";

export interface Snippet { title: string; note: string; code: string }

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The first call to make with a freshly created key: one that this key's scope is allowed to make. */
export function firstCallSnippet(base: string, key: string, scopes: readonly SnippetScope[]): Snippet {
  const origin = base.replace(/\/+$/, "");
  const auth = `-H ${q(`Authorization: Bearer ${key}`)}`;
  if (scopes.includes("admin")) {
    return {
      title: "Try it: create a connect link",
      note: "Run this in a terminal. Open the returned url to connect a mailbox; the line then appears under Lines.",
      code: `curl -X POST ${origin}/v1/connect-links \\\n  ${auth} \\\n  -H 'Content-Type: application/json' \\\n  -d '{"externalId":"user_42"}'`,
    };
  }
  return {
    title: "Try it: list connected mailboxes",
    note: `This key can ${scopes.includes("send") ? "read and send" : "read"}. Creating connect links and webhooks needs an admin key.`,
    code: `curl ${origin}/v1/accounts \\\n  ${auth}`,
  };
}

/** The connect-link example on the home page. Same request body as the quickstart, so both are executed by one e2e. */
export function homeConnectCurl(origin: string): string {
  const o = origin.replace(/\/+$/, "");
  return `curl -X POST ${o}/v1/connect-links \\
  -H "Authorization: Bearer $INBOXWIRE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"externalId":"cust_4821","redirectUrl":"https://app.example/done"}'

# 201 { "url": "${o}/connect/cl_9f2c…", "expiresAt": "…", "environment": "production" }`;
}
