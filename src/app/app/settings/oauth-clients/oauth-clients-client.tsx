"use client";
import { useState } from "react";
import Link from "next/link";
import { api, formatDate, useAsync } from "@/components/app/api";
import { CopyButton } from "@/components/app/copy-button";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, ErrorState, Notice, Skeleton } from "@/components/ui/states";

type Provider = "google" | "microsoft";
interface Info { redirectUri: string; scopes: string[]; hookUrl: string; gcloud: string[] }
interface Client { provider: Provider; clientId: string; pubsubTopic?: string | null; pubsubServiceAccount?: string | null; updatedAt: string }
interface Data { clients: Client[]; info: Record<Provider, Info> }

const TITLE: Record<Provider, string> = { google: "Google (Gmail API)", microsoft: "Microsoft (Graph)" };

function Mono({ children }: { children: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface-raised p-3">
      <code className="mono-sm min-w-0 break-all text-text">{children}</code>
      <CopyButton value={children} />
    </div>
  );
}

function ProviderPanel({ provider, data, canManage, reload, environment }: { provider: Provider; data: Data; canManage: boolean; reload: () => void; environment: string }) {
  const info = data.info[provider];
  const saved = data.clients.find((c) => c.provider === provider);
  const [clientId, setClientId] = useState(saved?.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [topic, setTopic] = useState(saved?.pubsubTopic ?? "");
  const [sa, setSa] = useState(saved?.pubsubServiceAccount ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await api("/api/oauth-clients", { method: "PUT", body: { environment, provider, clientId: clientId.trim(), clientSecret: secret, pubsubTopic: topic.trim() || undefined, pubsubServiceAccount: sa.trim() || undefined } });
    setBusy(false);
    if (!r.ok) {
      return setMsg({ ok: false, text: r.code === "invalid_input" ? "Check the client id, secret and Pub/Sub fields: one of them does not look right." : r.message });
    }
    setSecret(""); setMsg({ ok: true, text: "Saved. The secret is encrypted and will not be shown again." }); reload();
  }

  return (
    <Panel title={TITLE[provider]} description={saved ? `Connected to client ${saved.clientId}, updated ${formatDate(saved.updatedAt)}.` : "Not configured. Mailboxes of this provider cannot connect yet."} actions={saved ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">Not configured</Badge>}>
      <ol className="flex flex-col gap-6 body-6 text-text">
        <li className="flex flex-col gap-2">
          <span className="title-4">1. Create the OAuth client</span>
          <span className="text-text-subtle">{provider === "google" ? "In Google Cloud Console, create an OAuth client of type Web application." : "In Microsoft Entra, register an application (accounts in any organizational directory and personal accounts), then add a client secret."}</span>
          <span className="caption-2 text-text-subtle">Redirect URI (add it exactly as shown)</span>
          <Mono>{info.redirectUri}</Mono>
          <span className="caption-2 text-text-subtle">Scopes to enable</span>
          <Mono>{info.scopes.join(" ")}</Mono>
        </li>
        {provider === "google" ? (
          <li className="flex flex-col gap-2">
            <span className="title-4">2. Realtime with Pub/Sub (optional)</span>
            <span className="text-text-subtle">Without a topic, Gmail mailboxes are polled every minute. With one, events arrive in seconds. Run these with the gcloud CLI, replacing PROJECT_ID.</span>
            {info.gcloud.map((c) => <Mono key={c}>{c}</Mono>)}
          </li>
        ) : (
          <li className="flex flex-col gap-2">
            <span className="title-4">2. Realtime notifications</span>
            <span className="text-text-subtle">Graph change notifications are sent to this URL. Nothing to configure: we create the subscription for each mailbox.</span>
            <Mono>{info.hookUrl}</Mono>
          </li>
        )}
        <li>
          <form onSubmit={save} className="flex flex-col gap-4" aria-label={`${TITLE[provider]} credentials`}>
            <span className="title-4">3. Paste the credentials</span>
            <Field label="Client ID" htmlFor={`${provider}-id`}><Input id={`${provider}-id`} value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!canManage} autoComplete="off" spellCheck={false} /></Field>
            <Field label="Client secret" htmlFor={`${provider}-secret`} hint={saved ? "Leave blank only if you are not changing it: saving needs the secret again." : undefined}>
              <Input id={`${provider}-secret`} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} disabled={!canManage} autoComplete="off" />
            </Field>
            {provider === "google" ? (
              <>
                <Field label="Pub/Sub topic" htmlFor="g-topic" hint="projects/<project-id>/topics/<name>"><Input id="g-topic" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={!canManage} spellCheck={false} /></Field>
                <Field label="Push service account" htmlFor="g-sa" hint="Used to verify the signed token on every push."><Input id="g-sa" value={sa} onChange={(e) => setSa(e.target.value)} disabled={!canManage} spellCheck={false} /></Field>
              </>
            ) : null}
            {msg ? <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice> : null}
            <div><Button type="submit" loading={busy} disabled={!canManage || !clientId || !secret} title={!canManage ? "Only owners and admins can change this" : !clientId || !secret ? "Enter the client ID and secret first" : undefined}>Save credentials</Button></div>
            {!canManage ? <p className="caption-2 text-text-subtle">Only admins and owners can change OAuth clients.</p> : null}
          </form>
        </li>
      </ol>
    </Panel>
  );
}

const ENVS = ["production", "staging", "development"] as const;

export function OAuthClientsClient({ canManage }: { canManage: boolean }) {
  const [environment, setEnvironment] = useState<string>("production");
  return (
    <div className="flex flex-col gap-6">
      <Field label="Environment" htmlFor="oauth-env" hint="Each environment has its own OAuth clients, so staging and development connect links work too.">
        <select id="oauth-env" value={environment} onChange={(e) => setEnvironment(e.target.value)} className="min-h-11 w-full max-w-xs rounded-md border border-border bg-surface-raised px-3 text-text">
          {ENVS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Inner key={environment} environment={environment} canManage={canManage} />
    </div>
  );
}

function Inner({ environment, canManage }: { environment: string; canManage: boolean }) {
  const state = useAsync(async () => {
    const r = await api<Data>(`/api/oauth-clients?environment=${environment}`);
    if (!r.ok) throw new Error(r.code === "environment_limit" ? r.message : "load_failed");
    return r.data;
  });
  if (state.loading) return <Skeleton className="h-64 w-full" />;
  if (state.error && state.error !== "load_failed") return <Notice title={`No ${environment} environment on this plan`} action={<Link href="/app/billing" className="body-6 underline underline-offset-4 focus-visible:focus-ring">See plans</Link>}>{state.error}</Notice>;
  if (state.error || !state.data) return <ErrorState title="Could not load OAuth clients" body="Reload the page. If it keeps failing, check the status page." />;
  return (
    <div className="flex flex-col gap-6">
      <ProviderPanel provider="google" data={state.data} canManage={canManage} reload={state.reload} environment={environment} />
      <ProviderPanel provider="microsoft" data={state.data} canManage={canManage} reload={state.reload} environment={environment} />
    </div>
  );
}
