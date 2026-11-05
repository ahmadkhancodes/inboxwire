import { product } from "@/config/product";

/** "Inboxwire" in Chivo 800 + "by BufferSol" in Martian Mono on an amber jack tab (docs/DESIGN.md). */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-display text-text" style={{ fontWeight: 800, fontSize: 18, lineHeight: 1 }}>{product.name}</span>
      <span className="whitespace-nowrap rounded-sm bg-action px-2 py-1 font-mono text-action-text" style={{ fontWeight: 500, fontSize: 10, lineHeight: 1 }}>by BufferSol</span>
    </span>
  );
}
