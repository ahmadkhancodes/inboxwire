"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/app/api";
import { CopyButton } from "@/components/app/copy-button";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";

interface Created { url: string; expiresAt: string; environment: string; mailboxes: { used: number; included: number; canAdd: boolean; plan: string } }

/** Creates a single-use connect link from the dashboard, so the first line can be the user's own mailbox, no code needed. */
export function ConnectLinkPanel({ canCreate }: { canCreate: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<Created | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const r = await api<Created>("/api/app/connect-links", { body: { environment: "production" } });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setLink(r.data);
  }

  return (
    <Panel
      title="Connect a mailbox"
      description="Try it with your own inbox first: create a link, open it, pick Google, Microsoft or IMAP. In your product you create the same link from your backend with POST /v1/connect-links."
      actions={canCreate ? <Button type="button" onClick={create} loading={busy}>{link ? "Create another link" : "Create connect link"}</Button> : null}
    >
      {!canCreate ? <p className="body-6 text-text-subtle">Your role is read only. Ask an owner, admin or developer to create a connect link.</p> : null}
      {error ? <Notice tone="danger" title="No link created">{error}</Notice> : null}
      {link ? (
        <div role="status" className="flex flex-col gap-3">
          {!link.mailboxes.canAdd ? (
            <Notice tone="warning" title={`All ${link.mailboxes.included} mailboxes on ${link.mailboxes.plan} are in use`} action={<Link href="/app/billing" className="body-5 text-text underline underline-offset-4">See plans</Link>}>
              This link will be refused at the last step until you upgrade or delete a line.
            </Notice>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code data-testid="connect-link-url" className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface px-3 py-2 caption-2 text-text">{link.url}</code>
            <CopyButton value={link.url} label="Copy link" />
            <a href={link.url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center body-5 text-text underline decoration-border-strong decoration-2 underline-offset-4 hover:decoration-text focus-visible:focus-ring">Open</a>
          </div>
          <p className="body-6 text-text-subtle">Works once, until {new Date(link.expiresAt).toLocaleString()}, in the {link.environment} environment. When the mailbox is connected the line appears below and an accountConnected webhook fires.</p>
        </div>
      ) : null}
    </Panel>
  );
}
