import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { snapshot } from "@/lib/live/lines";
import { ConnectLinkPanel } from "./connect-link-panel";
import { LinesClient } from "./lines-client";

export const metadata = { title: "Lines" };
export const dynamic = "force-dynamic";

export default async function LinesPage() {
  const ctx = await requireOrg({ page: true });
  const initial = await snapshot(await getDb(), ctx.org.id);
  return (
    <>
      <PageHeader field="Mail / lines" title="Lines" description="Every connected mailbox is a line. The lamp shows its state, and it changes here within seconds." />
      <ConnectLinkPanel canCreate={can(ctx.role, "data", "write")} />
      <LinesClient initial={initial} />
    </>
  );
}
