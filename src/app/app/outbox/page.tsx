import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/auth/session";
import { OutboxClient } from "./outbox-client";

export const metadata = { title: "Outbox" };

export default async function OutboxPage() {
  await requireOrg({ page: true });
  return (
    <>
      <PageHeader title="Outbox" description="Messages queued with POST /v1/accounts/{id}/messages/send. Failed sends retry up to five times. Items are kept for 7 days." />
      <OutboxClient />
    </>
  );
}
