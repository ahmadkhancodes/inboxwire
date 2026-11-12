import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic gate only: a cheap cookie-presence check, never a DB call (Next 16 proxy).
 * Real authorization happens in the server components via requireOrg().
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith(".session_token"));
  if (hasSession) return NextResponse.next();
  // A background fetch without a session (a router prefetch still in flight right after sign-out, or a client navigation after the
  // session expired) gets an empty 204 instead of a redirect: following the redirect fetches /sign-in in the background, which the
  // CSP's upgrade-insecure-requests breaks on plain-http hosts. A 204 is not a valid flight payload, so a real client navigation
  // falls back to a full page load, which redirects below. Next 16 strips `rsc` and `next-router-prefetch` before the proxy runs,
  // so the browser's own `Sec-Fetch-Dest: empty` (fetch/XHR, never a document navigation) is the signal that survives.
  const h = request.headers;
  if (h.get("sec-fetch-dest") === "empty" || h.get("next-router-prefetch") || h.get("next-router-segment-prefetch")) return new NextResponse(null, { status: 204 });
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/sign-in";
  url.search = "";
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
