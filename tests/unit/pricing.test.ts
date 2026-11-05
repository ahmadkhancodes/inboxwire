import { describe, expect, it } from "vitest";
import { cloudBill, emailengineMonthly, nylasBill, selfHostMonthly } from "@/lib/pricing";

describe("mailbox bill maths", () => {
  it("cloud tiers and the $0.99 extra", () => {
    expect(cloudBill(3).cents).toBe(0);
    expect(cloudBill(4).cents).toBe(2499);
    expect(cloudBill(25).cents).toBe(2499);
    expect(cloudBill(26).cents).toBe(9999);
    expect(cloudBill(100).cents).toBe(9999);
    expect(cloudBill(101).cents).toBe(9999 + 99);
    expect(cloudBill(200).cents).toBe(9999 + 100 * 99);
  });
  it("self-host and EmailEngine are flat", () => {
    expect(selfHostMonthly()).toBe(5900);
    expect(emailengineMonthly()).toBe(12083);
  });
  it("nylas published tiers", () => {
    expect(nylasBill(5).cents).toBe(0);
    expect(nylasBill(10).cents).toBe(1500);
    expect(nylasBill(25).cents).toBe(4900);
    expect(nylasBill(100).cents).toBe(4900 + 75 * 200);
  });
});
