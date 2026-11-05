import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme";
import { product } from "@/config/product";

export const metadata = { title: `Connect a mailbox | ${product.fullName}`, robots: { index: false, follow: false } };

export default function ConnectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <span className="heading-6 text-text">{product.fullName}</span>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="flex w-full max-w-md flex-col gap-8">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center caption-2 text-text-subtle sm:px-6">
        Your mailbox password is encrypted before it is stored. Connection details are only used to read and send mail on behalf of the app that sent you here.
      </footer>
    </div>
  );
}
