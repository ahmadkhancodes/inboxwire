import { product } from "@/config/product";

/** "Inboxwire" in Plex Sans Condensed 700 + "by BufferSol" in Plex Mono, separated by a hairline (docs/design-brief.md). */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-block size-3 bg-mark ring-1 ring-text" />
      <span className="font-display text-text" style={{ fontWeight: 700, fontSize: 20, lineHeight: 1, letterSpacing: "-0.01em" }}>{product.name}</span>
      <span className="whitespace-nowrap border-l border-border-strong pl-2 font-mono text-text-subtle" style={{ fontWeight: 400, fontSize: 11, lineHeight: 1 }}>by BufferSol</span>
    </span>
  );
}
