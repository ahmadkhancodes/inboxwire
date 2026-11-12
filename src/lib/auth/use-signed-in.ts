"use client";
import { useSyncExternalStore } from "react";

/**
 * Cheap session check for the cached marketing pages. One GET /api/auth/get-session per page load (shared by every
 * caller), no auth-client bundle. Server render and first paint are always the signed-out state (so the HTML stays
 * static and cacheable); a signed-in visitor sees labels swap once, about one round trip after hydration.
 */
let state: boolean | null = null; // null = not asked yet
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started) return;
  started = true;
  fetch("/api/auth/get-session", { credentials: "same-origin", headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: { user?: unknown } | null) => { state = !!s?.user; })
    .catch(() => { state = false; })
    .finally(() => listeners.forEach((l) => l()));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => { listeners.delete(cb); };
}

export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribe, () => state === true, () => false);
}
