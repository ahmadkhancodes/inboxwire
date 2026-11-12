import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("proxy gate", () => {
  it("redirects a signed-out navigation to sign-in and keeps the path", () => {
    const res = proxy(new NextRequest("http://localhost:3100/app/ticker"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3100/sign-in?next=%2Fapp%2Fticker");
  });
  it("answers a signed-out router prefetch with an empty 204, not a redirect", () => {
    const res = proxy(new NextRequest("http://localhost:3100/app/ticker", { headers: { "next-router-prefetch": "1", rsc: "1" } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("location")).toBeNull();
  });
  it("answers a signed-out segment prefetch (Next 16) with 204 too", () => {
    const res = proxy(new NextRequest("http://localhost:3100/app/lines", { headers: { "next-router-segment-prefetch": "/_tree", rsc: "1" } }));
    expect(res.status).toBe(204);
  });
  it("answers a signed-out background fetch (Sec-Fetch-Dest: empty, the only header Next 16 leaves the proxy) with 204", () => {
    const res = proxy(new NextRequest("http://localhost:3100/app/lines", { headers: { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" } }));
    expect(res.status).toBe(204);
  });
  it("still redirects a real document navigation", () => {
    const res = proxy(new NextRequest("http://localhost:3100/app/lines", { headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" } }));
    expect(res.status).toBe(307);
  });
  it("lets a request with a session cookie through", () => {
    const res = proxy(new NextRequest("http://localhost:3100/app", { headers: { cookie: "better-auth.session_token=abc" } }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});
