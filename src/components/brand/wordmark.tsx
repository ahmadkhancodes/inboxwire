import { product } from "@/config/product";

/** "Inboxwire" in Plex Sans Condensed 700 + "by BufferSol" in Plex Mono, separated by a hairline (docs/design-brief.md). */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-block size-3 bg-mark ring-1 ring-text" />
      <span className="font-display heading-6 text-text">{product.name}</span>
      <span className="whitespace-nowrap border-l border-border-strong pl-2 font-mono caption-5 text-text-subtle">by BufferSol</span>
    </span>
  );
}
