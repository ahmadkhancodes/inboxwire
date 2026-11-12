"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Section } from "@/components/ui/layout";

/** Trigger line at 60% of the viewport height: a word lights up once it has scrolled above it. */
export const TAGLINE_ROOT_MARGIN = "0px 0px -40% 0px";

export function taglineWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Large statement (landing page library B11). Each word starts at 30% opacity of the band's text colour and
 * turns full colour as it crosses the trigger line, one IntersectionObserver entry per word, once.
 * Under prefers-reduced-motion every word is on from the start (and the CSS drops the transition).
 */
export function TaglineReveal({ text, label }: { text: string; label?: string }) {
  const words = useMemo(() => taglineWords(text), [text]);
  const ref = useRef<HTMLParagraphElement>(null);
  const [on, setOn] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const all = () => setOn(new Set(words.map((_, i) => i)));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      all();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        let upTo = -1;
        for (const e of entries) {
          const above = e.boundingClientRect.bottom < (e.rootBounds?.top ?? 0);
          if (e.target === el) {
            // A jump (anchor link, fast flick) can carry words past the line without crossing it: finish them all.
            if (!e.isIntersecting && above) upTo = words.length - 1;
            continue;
          }
          if (e.isIntersecting || above) {
            upTo = Math.max(upTo, Number((e.target as HTMLElement).dataset.i));
            io.unobserve(e.target);
          }
        }
        // Reading order: a word never lights up before the words in front of it.
        if (upTo >= 0) setOn((prev) => (prev.size > upTo ? prev : new Set(words.slice(0, upTo + 1).map((_, i) => i))));
      },
      { rootMargin: TAGLINE_ROOT_MARGIN },
    );
    io.observe(el);
    el.querySelectorAll<HTMLElement>("[data-i]").forEach((w) => io.observe(w));
    return () => io.disconnect();
  }, [words]);

  return (
    <Section tone="inverse" size="lg" labelledBy="tagline-title">
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-12">
        <p className="font-mono caption-5 text-text-inverse/70 lg:col-span-2 lg:pt-2">{label ?? "Data handling"}:</p>
        <h2 id="tagline-title" className="sr-only">{text}</h2>
        <p ref={ref} aria-hidden className="heading-4 md:heading-3 lg:heading-2 max-w-hero lg:col-span-10">
          {words.map((w, i) => (
            <span key={i} data-i={i} className="kit-word" data-on={on.has(i)}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </Section>
  );
}
