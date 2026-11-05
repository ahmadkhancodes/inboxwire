import { product } from "@/config/product";

export const metadata = { title: `Mailbox connected | ${product.fullName}` };

export default async function DonePage({ searchParams }: { searchParams: Promise<{ email?: string; error?: string }> }) {
  const q = await searchParams;
  if (q.error) {
    return (
      <div className="flex flex-col gap-4" role="alert">
        <h1 className="heading-5 text-text">Connection cancelled</h1>
        <p className="body-6 text-text-subtle">The provider did not grant access, so nothing was connected. Go back to the app and start again if you want to retry.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="heading-5 text-text">Mailbox connected</h1>
      <p className="body-6 text-text-subtle">{q.email ? `${q.email} is connected.` : "Your mailbox is connected."} You can close this tab and return to the app.</p>
    </div>
  );
}
