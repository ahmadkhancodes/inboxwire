import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { snapshot } from "@/lib/live/lines";
import { TickerClient } from "./ticker-client";

export const metadata = { title: "Ticker" };
export const dynamic = "force-dynamic";

export default async function TickerPage() {
  const ctx = await requireOrg({ page: true });
  return (
    <>
      <PageHeader field="Mail / ticker" title="Ticker" description="Every webhook event as it is queued, newest on top." />
      <TickerClient initial={await snapshot(await getDb(), ctx.org.id)} />
    </>
  );
}
