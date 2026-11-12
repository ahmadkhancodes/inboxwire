import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { DocsNav } from "@/components/docs/docs-nav";
import { Container } from "@/components/ui/layout";
import { docGroups } from "@/content/docs";
import { product, cadence } from "@/config/product";
import { appUrl } from "@/lib/env";
import { buildOpenApi, operations } from "@/lib/openapi";
import { pageMetadata } from "@/lib/seo";
import { operationCurl, VERIFY_NODE } from "@/lib/docs-curl";

export const metadata = pageMetadata({
  title: "API reference",
  description: `Every ${product.name} /v1 endpoint: read, search and send mail, webhooks, delivery log and replay. Generated from the OpenAPI 3.1 document.`,
  path: "/docs/api",
});

type Prop = { name: string; type: string; required: boolean; description?: string };
type Schema = { type?: string | string[]; properties?: Record<string, Schema & { description?: string }>; required?: string[]; enum?: unknown[]; format?: string; items?: Schema; default?: unknown; anyOf?: Schema[] };
type Spec = { parameters?: { name: string; in: string; required?: boolean; description?: string; schema: Schema }[]; requestBody?: { content: { "application/json": { schema: Schema } } } };

const typeOf = (s: Schema): string => {
  if (s.enum) return s.enum.map((e) => JSON.stringify(e)).join(" | ");
  if (s.anyOf) return s.anyOf.map(typeOf).filter((t) => t !== "null").join(" | ");
  const t = Array.isArray(s.type) ? s.type.join(" | ") : s.type ?? "object";
  if (t === "array") return `${s.items ? typeOf(s.items) : "any"}[]`;
  return s.format && t === "string" ? `${t} (${s.format})` : t;
};
const flat = (s?: Schema): Prop[] => Object.entries(s?.properties ?? {}).map(([name, p]) => ({ name, type: typeOf(p), required: !!s?.required?.includes(name) && p.default === undefined, description: p.description }));

const METHOD = "caption-3 inline-flex min-w-16 justify-center rounded-md border border-border-strong bg-surface-sunken px-2 py-0.5 font-mono text-text";

function Params({ title, rows }: { title: string; rows: Prop[] }) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="caption-3 text-text-muted">{title}</h4>
      <div className="relative max-w-full overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-96 text-left">
          <thead className="bg-surface-sunken"><tr><th scope="col" className="caption-3 px-3 py-2 text-text-muted">Name</th><th scope="col" className="caption-3 px-3 py-2 text-text-muted">Type</th><th scope="col" className="caption-3 px-3 py-2 text-text-muted">Notes</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-border align-top">
                <td className="body-6 px-3 py-2 font-mono text-text">{r.name}{r.required ? <span className="text-text-muted"> *</span> : null}</td>
                <td className="body-6 px-3 py-2 font-mono text-text-subtle">{r.type}</td>
                <td className="body-6 px-3 py-2 text-text-subtle">{r.description ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EVENTS: Prop[] = [
  { name: "messageNew", type: "event", required: false, description: "A message arrived. The default for new endpoints." },
  { name: "messageMoved", type: "event", required: false, description: "Labels or folder changed." },
  { name: "messageDeleted", type: "event", required: false, description: "A message was deleted." },
  { name: "messageSent", type: "event", required: false, description: "A queued send went out." },
  { name: "messageFailed", type: "event", required: false, description: "A queued send failed for good." },
  { name: "accountConnected", type: "event", required: false, description: "A mailbox was connected." },
  { name: "accountInitialized", type: "event", required: false, description: "History was reset; resync if you track state." },
  { name: "accountError", type: "event", required: false, description: "The mailbox needs attention." },
];



const Code = ({ children }: { children: React.ReactNode }) => <code className="font-mono">{children}</code>;

export default function ApiReferencePage() {
  const doc = buildOpenApi() as { paths: Record<string, Record<string, Spec>> };
  const base = appUrl();
  const groups = docGroups.map((g) => ({ title: g.title, items: g.docs.map((d) => ({ slug: d.slug, title: d.title })) }));
  const tags = [...new Set(operations.map((o) => o.tag))];
  return (
    <Container className="py-12 md:py-20">
      <div className="grid gap-8 lg:grid-cols-4 lg:gap-12">
        <aside className="lg:col-span-1">
          <div className="flex flex-col gap-6 lg:sticky lg:top-24">
            <DocsNav groups={groups} current="api" />
            <nav aria-label="Endpoints" className="hidden flex-col gap-1 lg:flex">
              <p className="caption-3 text-text-muted">Endpoints</p>
              {tags.map((t) => <a key={t} href={`#${t.toLowerCase()}`} className="body-6 min-h-8 text-text-subtle hover:text-text focus-visible:focus-ring">{t}</a>)}
              <a href="#events" className="body-6 min-h-8 text-text-subtle hover:text-text focus-visible:focus-ring">Webhook events</a>
            </nav>
          </div>
        </aside>
        <article className="flex min-w-0 flex-col gap-12 lg:col-span-3">
          <header className="flex flex-col gap-3">
            <p className="caption-2 text-text-muted"><Link href="/docs" className="underline underline-offset-4 hover:text-text focus-visible:focus-ring">Docs</Link></p>
            <h1 className="heading-4 text-text">API reference</h1>
            <p className="body-3 max-w-2xl text-text-subtle">One REST API for Gmail, Microsoft 365 and IMAP. Base URL <Code>{base}/v1</Code>. Machine readable: <a className="underline underline-offset-4 hover:text-text focus-visible:focus-ring" href="/v1/openapi.json">/v1/openapi.json</a> (OpenAPI 3.1).</p>
          </header>

          <section aria-labelledby="auth-h" className="flex flex-col gap-3">
            <h2 id="auth-h" className="heading-6 text-text">Authentication, scopes and environments</h2>
            <p className="body-3 text-text-subtle">Send your key as <Code>Authorization: Bearer &lt;key&gt;</Code>. A key has scopes: <Code>read</Code>, <Code>send</Code> (includes read) and <Code>admin</Code> (includes both). A key without the scope an endpoint needs gets 403 <Code>insufficient_scope</Code>. Choose the environment with <Code>x-environment: development | staging | production</Code>; production is the default.</p>
            <p className="body-3 text-text-subtle">Errors are JSON, <Code>{`{"error":"code"}`}</Code>, with a <Code>details</Code> field when there is more to say. Each key may make 600 requests a minute; past that you get 429.</p>
          </section>

          {tags.map((tag) => (
            <section key={tag} id={tag.toLowerCase()} aria-labelledby={`${tag}-h`} className="flex scroll-mt-24 flex-col gap-8">
              <h2 id={`${tag}-h`} className="heading-5 text-text">{tag}</h2>
              {operations.filter((o) => o.tag === tag).map((op) => {
                const spec = doc.paths[op.path]![op.method]!;
                const other = (spec.parameters ?? []).filter((p) => p.in !== "path").map((p) => ({ name: p.name, type: typeOf(p.schema), required: !!p.required, description: p.description }));
                const path = (spec.parameters ?? []).filter((p) => p.in === "path").map((p) => ({ name: p.name, type: "string", required: true }));
                return (
                  <div key={op.id} id={op.id} className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={METHOD}>{op.method.toUpperCase()}</span>
                      <code className="body-5 break-all font-mono text-text">/v1{op.path}</code>
                    </div>
                    <h3 className="title-2 text-text">{op.summary}</h3>
                    <p className="body-6 max-w-2xl text-text-subtle">{op.description}</p>
                    <p className="caption-4 text-text-muted">Scope: <span className="font-mono">{op.scope}</span>{op.causes ? <> · Causes webhooks: <span className="font-mono">{op.causes.join(", ")}</span></> : null}</p>
                    <Params title="Path parameters" rows={path} />
                    <Params title="Query and headers" rows={other} />
                    <Params title="Request body (JSON)" rows={flat(spec.requestBody?.content["application/json"].schema)} />
                    <CodeBlock code={operationCurl(op, base)} lang="curl" />
                  </div>
                );
              })}
            </section>
          ))}

          <section id="events" aria-labelledby="events-h" className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-6">
            <h2 id="events-h" className="heading-5 text-text">Webhook events and signatures</h2>
            <p className="body-3 text-text-subtle">Events are POSTed as JSON <Code>{`{"id","type","created","data"}`}</Code>. The <Code>id</Code> stays the same on retries and replays, so use it to dedupe. Return any 2xx within 10 seconds; otherwise {cadence.retryApi}. After 72 hours of failures the endpoint is disabled and the owners get an email. Failed events stay in the delivery log and can be replayed.</p>
            <p className="body-3 text-text-subtle">Verify every request: compute HMAC-SHA256 of <Code>{"<t>.<raw body>"}</Code> with your endpoint secret and compare it to <Code>v1</Code> in the <Code>Inboxwire-Signature</Code> header. Reject timestamps older than five minutes.</p>
            <CodeBlock lang="node" code={VERIFY_NODE} />
            <Params title="Events" rows={EVENTS} />
          </section>
        </article>
      </div>
    </Container>
  );
}
