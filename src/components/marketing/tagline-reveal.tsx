"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Section } from "@/components/ui/layout";

/** A large statement whose words light up one by one as it scrolls through the viewport. */
export function TaglineReveal({ text, label }: { text: string; label?: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ref = useRef<HTMLParagraphElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the block enters at 85% of the viewport, 1 once it has travelled its own height plus 35% of the viewport.
      const p = Math.min(1, Math.max(0, (vh * 0.85 - rect.top) / (rect.height + vh * 0.35)));
      const next = Math.round(p * words.length);
      setActive((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [words.length]);

  return (
    <Section tone="inverse" size="lg">
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-12">
        <p className="font-mono caption-5 text-text-inverse/70 lg:col-span-2 lg:pt-2">{label ?? "Data handling"}:</p>
        <p ref={ref} className="heading-4 md:heading-2 lg:heading-1 max-w-5xl lg:col-span-10">
          {words.map((w, i) => (
            <span key={i} className="kit-word" data-on={i < active}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </Section>
  );
}
