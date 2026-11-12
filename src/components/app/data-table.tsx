import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface Column { key: string; label: string; align?: "left" | "right"; className?: string }

/** Table with a sticky header and tabular numerals. Wraps in a scroll container so phones never overflow the page. */
export function DataTable({ caption, columns, children, maxHeight = false }: { caption: string; columns: Column[]; children: ReactNode; maxHeight?: boolean }) {
  return (
    <div className={cn("relative w-full max-w-full overflow-auto border border-border bg-surface", maxHeight && "max-h-dvh")}>
      <table className="w-full border-collapse text-left tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-sunken px-4 py-2 font-mono caption-5 font-normal text-text-muted", c.align === "right" && "text-right", c.className)}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr]:transition-colors [&>tr]:duration-200 [&>tr:hover]:bg-surface-sunken">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, align, className, muted }: { children?: ReactNode; align?: "left" | "right"; className?: string; muted?: boolean }) {
  return <td className={cn("px-4 py-2 body-6 align-middle", muted ? "text-text-subtle" : "text-text", align === "right" && "text-right", className)}>{children}</td>;
}
