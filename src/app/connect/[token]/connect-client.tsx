"use client";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";

interface Discovery { provider: "google" | "microsoft" | "imap"; imap?: Server; smtp?: Server; oauthReady: boolean | null }
interface Server { host: string; port: number; secure: boolean }

const MESSAGES: Record<string, string> = {
  link_used: "This link was already used. Ask the app for a new one.",
  link_expired: "This link has expired. Ask the app for a new one.",
  imap_verification_failed: "We could not sign in with those details.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  mailbox_limit: "This app has reached its mailbox limit, so we could not add your mailbox. Ask the app owner to upgrade their plan.",
};

export function ConnectClient({ token, email: initial }: { token: string; email: string }) {
  const [email, setEmail] = useState(initial);
  const [d, setD] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; redirectUrl: string | null } | null>(null);
  const [form, setForm] = useState({ password: "", username: "", imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "465" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function discover(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await api<Discovery>(`/api/connect/${token}/discover`, { body: { email: email.trim() } });
    setBusy(false);
    if (!r.ok) return setError(MESSAGES[r.code] ?? (r.status === 400 ? "Enter a valid email address." : r.message));
    setD(r.data);
    if (r.data.provider === "imap") setForm((f) => ({ ...f, imapHost: r.data.imap?.host ?? "", imapPort: String(r.data.imap?.port ?? 993), smtpHost: r.data.smtp?.host ?? "", smtpPort: String(r.data.smtp?.port ?? 465) }));
  }

  async function connectImap(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await api<{ email: string; redirectUrl: string | null }>(`/api/connect/${token}/imap`, {
      body: {
        email: email.trim(), username: form.username.trim() || undefined, password: form.password,
        imap: { host: form.imapHost.trim(), port: Number(form.imapPort), secure: Number(form.imapPort) === 993 },
        smtp: form.smtpHost ? { host: form.smtpHost.trim(), port: Number(form.smtpPort), secure: Number(form.smtpPort) === 465 } : undefined,
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.code === "imap_verification_failed" ? "We could not sign in. Check the password (use an app password if your provider requires one) and the server name, then try again." : MESSAGES[r.code] ?? r.message);
    setDone(r.data);
    if (r.data.redirectUrl) window.location.assign(r.data.redirectUrl);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h1 className="heading-5 text-text">Mailbox connected</h1>
        <p className="body-6 text-text-subtle">{done.email} is connected. {done.redirectUrl ? "Taking you back to the app." : "You can close this tab."}</p>
        {done.redirectUrl ? <div><ButtonLink href={done.redirectUrl}>Return to the app</ButtonLink></div> : null}
      </div>
    );
  }

  const oauthHref = (p: "google" | "microsoft") => `/api/connect/${token}/start/${p}?email=${encodeURIComponent(email.trim())}`;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="heading-5 text-text">Connect your mailbox</h1>
        <p className="body-6 text-text-subtle">Enter your email address. We find the right sign-in method for it.</p>
      </div>
      <form onSubmit={discover} className="flex flex-col gap-4" aria-label="Email address">
        <Field label="Email address" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setD(null); }} />
        </Field>
        {!d ? <div><Button type="submit" loading={busy}>Continue</Button></div> : null}
      </form>

      {d && d.provider !== "imap" ? (
        <div className="flex flex-col gap-4">
          {d.oauthReady ? (
            <>
              <p className="body-6 text-text">This is a {d.provider === "google" ? "Google" : "Microsoft"} mailbox. You will sign in on {d.provider === "google" ? "Google" : "Microsoft"}&apos;s own page; we never see your password.</p>
              {/* Plain anchor: the start route sets one-time state, so it must not be prefetched. */}
              <div><a href={oauthHref(d.provider)} className={buttonClass()}>Continue with {d.provider === "google" ? "Google" : "Microsoft"}</a></div>
            </>
          ) : (
            <Notice tone="warning" title="Not set up yet">The app that sent you here has not finished configuring {d.provider === "google" ? "Google" : "Microsoft"} sign-in. Ask them to complete the OAuth client setup, then use a new link.</Notice>
          )}
        </div>
      ) : null}

      {d && d.provider === "imap" ? (
        <form onSubmit={connectImap} className="flex flex-col gap-4" aria-label="IMAP and SMTP settings">
          <Field label="Password" htmlFor="password" hint="Many providers need an app password instead of your normal one."><Input id="password" type="password" required autoComplete="current-password" value={form.password} onChange={set("password")} /></Field>
          <Field label="Username" htmlFor="username" hint="Leave blank to use your email address."><Input id="username" value={form.username} onChange={set("username")} autoComplete="username" /></Field>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field label="IMAP server" htmlFor="imap-host"><Input id="imap-host" required value={form.imapHost} onChange={set("imapHost")} spellCheck={false} /></Field>
            <Field label="Port" htmlFor="imap-port"><Input id="imap-port" inputMode="numeric" required value={form.imapPort} onChange={set("imapPort")} /></Field>
            <Field label="SMTP server" htmlFor="smtp-host"><Input id="smtp-host" value={form.smtpHost} onChange={set("smtpHost")} spellCheck={false} /></Field>
            <Field label="Port" htmlFor="smtp-port"><Input id="smtp-port" inputMode="numeric" value={form.smtpPort} onChange={set("smtpPort")} /></Field>
          </div>
          <div><Button type="submit" loading={busy}>Connect mailbox</Button></div>
        </form>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
