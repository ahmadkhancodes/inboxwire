import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic gate only: a cheap cookie-presence check, never a DB call (Next 16 proxy).
 * Real authorization happens in the server components via requireOrg().
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith(".session_token"));
  if (hasSession) return NextResponse.next();
  // A router prefetch without a session (e.g. still in flight right after sign-out) gets an empty answer instead of
  // a redirect: redirecting it fetches /sign-in in the background, which the CSP's upgrade-insecure-requests breaks
  // on plain-http hosts. A real navigation still redirects below.
  if (request.headers.get("next-router-prefetch")) return new NextResponse(null, { status: 204 });
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
