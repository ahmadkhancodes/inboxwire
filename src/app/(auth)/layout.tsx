import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Tape } from "@/components/marketing/demo/lines-ticker";
import { product } from "@/config/product";

const NEXT = [
  ["01", "Open the link we email you. It works once, on any device."],
  ["02", "Name your organization. Developer tier, 3 mailboxes, no card."],
  ["03", "Create an API key and a connect link. Events print on the ticker."],
] as const;

/** Auth screens: ruled header, the form on the left, what happens next and a real delivery log on the right (lg). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="border-b border-border">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link href="/" className="inline-flex min-h-11 items-center focus-visible:focus-ring" aria-label={`${product.fullName} home`}><Wordmark /></Link>
          <Link href="/docs" className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 body-5 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">Docs</Link>
        </div>
      </header>
      <div className="grid flex-1 lg:grid-cols-2">
        <main id="main" className="flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-md flex-col gap-8">{children}</div>
        </main>
        <aside aria-label="What happens next" className="hidden flex-col justify-center gap-8 border-l border-border bg-surface-sunken px-10 py-12 lg:flex">
          <div className="flex max-w-md flex-col">
            <p className="mb-2 font-mono caption-5 text-text-muted">What happens next</p>
            <ol className="m-0 list-none border-y border-border p-0">
              {NEXT.map(([n, t]) => (
                <li key={n} className="flex gap-4 border-t border-border py-3 first:border-t-0">
                  <span className="font-mono caption-5 text-text-muted">{n}</span>
                  <span className="body-6 text-text">{t}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="max-w-md border border-border-strong">
            <p className="border-b border-border bg-surface px-4 py-2 font-mono caption-5 text-text-muted">Example: webhook deliveries</p>
            <Tape />
          </div>
        </aside>
      </div>
      <footer className="border-t border-border px-4 py-2 sm:px-6 lg:px-10">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">
          <ArrowLeft size={16} weight="regular" aria-hidden />
          Back to {product.name}
        </Link>
      </footer>
    </div>
  );
}
