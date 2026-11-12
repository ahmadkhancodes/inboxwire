import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { OAuthClientsClient } from "./oauth-clients-client";

export const metadata = { title: "OAuth clients" };

export default async function OAuthClientsPage() {
  const ctx = await requireOrg({ page: true });
  return (
    <>
      <PageHeader field="Developers / oauth clients" title="OAuth clients" description="Gmail and Microsoft 365 mailboxes connect through your own OAuth app, so consent screens carry your name and Google's restricted-scope review is yours to run. Secrets are encrypted at rest and never shown again." />
      <OAuthClientsClient canManage={can(ctx.role, "apiKey", "manage")} />
    </>
  );
}
