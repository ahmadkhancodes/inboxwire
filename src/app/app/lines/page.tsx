import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { snapshot } from "@/lib/live/lines";
import { LinesClient } from "./lines-client";

export const metadata = { title: "Lines" };
export const dynamic = "force-dynamic";

export default async function LinesPage() {
  const ctx = await requireOrg({ page: true });
  const initial = await snapshot(await getDb(), ctx.org.id);
  return (
    <>
      <PageHeader title="Lines" description="Every connected mailbox is a line. The lamp shows its state, and it changes here within seconds." />
      <LinesClient initial={initial} />
    </>
  );
}
