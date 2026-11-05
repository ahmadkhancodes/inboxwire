"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { LineEvent, LiveSnapshot } from "@/lib/live/lines";

export type LiveMode = "connecting" | "live" | "polling";

/**
 * Live Lines and events: server-sent events from /api/app/live (state changes arrive within a couple of seconds),
 * falling back to polling /api/app/live/snapshot every 5 s when EventSource is missing or fails three times in a row.
 */
export function useLive(initial: LiveSnapshot | null) {
  const [snap, setSnap] = useState<LiveSnapshot | null>(initial);
  const [mode, setMode] = useState<LiveMode>("connecting");
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let fails = 0;
    let alive = true;

    const poll = async () => {
      const r = await api<LiveSnapshot>("/api/app/live/snapshot");
      if (!alive) return;
      setMode("polling");
      if (r.ok) { setSnap(r.data); setError(null); } else setError(r.message);
    };
    const startPolling = () => {
      if (timer) return;
      void poll();
      timer = setInterval(() => void poll(), 5000);
    };

    if (typeof EventSource === "undefined") startPolling();
    else {
      es = new EventSource("/api/app/live");
      es.addEventListener("snapshot", (e) => { fails = 0; setMode("live"); setError(null); setSnap(JSON.parse((e as MessageEvent<string>).data) as LiveSnapshot); });
      es.addEventListener("lines", (e) => setSnap((s) => ({ events: s?.events ?? [], at: new Date().toISOString(), lines: JSON.parse((e as MessageEvent<string>).data) as LiveSnapshot["lines"] })));
      es.addEventListener("ticker", (e) => {
        const ev = JSON.parse((e as MessageEvent<string>).data) as LineEvent;
        setSnap((s) => (s && !s.events.some((x) => x.id === ev.id) ? { ...s, events: [ev, ...s.events].slice(0, 100) } : s));
      });
      es.onerror = () => {
        // The browser reconnects by itself after every planned end of the stream; only repeated failures switch to polling.
        fails++;
        if (fails >= 3) { es?.close(); es = null; startPolling(); }
      };
    }
    stop.current = () => { alive = false; es?.close(); if (timer) clearInterval(timer); };
    return () => stop.current();
  }, []);

  return { snap, mode, error };
}
