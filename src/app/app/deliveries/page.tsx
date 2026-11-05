import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { DeliveriesClient } from "./deliveries-client";

export const metadata = { title: "Deliveries" };

export default async function DeliveriesPage() {
  const ctx = await requireOrg({ page: true });
  return (
    <>
      <PageHeader title="Deliveries" description="Every webhook attempt with its status code and latency. Replay one delivery, or all that ran out of retries." />
      <DeliveriesClient canReplay={can(ctx.role, "webhook", "manage")} />
    </>
  );
}
