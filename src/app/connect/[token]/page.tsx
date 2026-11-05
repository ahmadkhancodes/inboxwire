import { ButtonLink } from "@/components/ui/button";
import { lookupConnectLink } from "@/lib/connect/links";
import { getDb } from "@/lib/db";
import { ConnectClient } from "./connect-client";

export const dynamic = "force-dynamic";

const COPY = {
  not_found: { title: "This link is not valid", body: "Check that you copied the whole address, or ask the app that sent you here for a new link." },
  used: { title: "This link was already used", body: "Each connect link works once. If the mailbox is not connected yet, ask the app for a new link." },
  expired: { title: "This link has expired", body: "Connect links last 24 hours. Ask the app that sent you here for a new one." },
} as const;

/** Hosted connect page. Unknown/used/expired links render an explanation (the JSON API returns 404/410 for the same states). */
export default async function ConnectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await lookupConnectLink(await getDb(), token);
  if (!r.ok) {
    const c = COPY[r.reason];
    return (
      <div className="flex flex-col gap-4" role="alert">
        <h1 className="heading-5 text-text">{c.title}</h1>
        <p className="body-6 text-text-subtle">{c.body}</p>
        <div><ButtonLink href="/" variant="secondary">Back to Inboxwire by BufferSol</ButtonLink></div>
      </div>
    );
  }
  return <ConnectClient token={token} email={r.link.email ?? ""} />;
}
