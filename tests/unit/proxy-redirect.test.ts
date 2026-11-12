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
  it("lets a request with a session cookie through", () => {
    const res = proxy(new NextRequest("http://localhost:3100/app", { headers: { cookie: "better-auth.session_token=abc" } }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});
