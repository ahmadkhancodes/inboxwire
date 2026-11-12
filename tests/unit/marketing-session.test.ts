import { describe, expect, it } from "vitest";
import { plans } from "@/config/product";
import { pricingCta, sessionCta } from "@/lib/marketing-session";

describe("marketing session labels", () => {
  it("signed out keeps the signup hand-off", () => {
    const starter = plans.find((p) => p.id === "starter")!;
    expect(pricingCta(starter, "month", false)).toEqual({ href: "/sign-in?plan=starter&interval=month", label: starter.cta });
    expect(sessionCta({ href: "/sign-in", label: "Start free" }, false)).toEqual({ href: "/sign-in", label: "Start free" });
  });
  it("signed in never says Start free and goes to the app or billing", () => {
    const free = plans.find((p) => p.id === "free")!;
    const growth = plans.find((p) => p.id === "growth")!;
    expect(pricingCta(free, "year", true)).toEqual({ href: "/app", label: "Open dashboard" });
    expect(pricingCta(growth, "year", true).href).toBe("/app/billing?plan=growth&interval=year");
    for (const p of plans) expect(pricingCta(p, "year", true).label).not.toMatch(/start free/i);
    expect(sessionCta({ href: "/sign-in", label: "Start free" }, true)).toEqual({ href: "/app", label: "Open dashboard" });
  });
});
