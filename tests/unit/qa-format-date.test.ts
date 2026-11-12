import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatDate } from "@/components/app/format-date";

describe("formatDate is callable from server pages", () => {
  it("formats in UTC", () => {
    expect(formatDate("2026-11-12T08:00:00Z")).toBe("Nov 12, 2026");
    expect(formatDate(null)).toBe("Never");
    expect(formatDate("garbage")).toBe("Unknown");
  });
  it("the audit server page does not import it from the 'use client' api module (that crashed the page)", () => {
    const src = readFileSync("src/app/app/settings/audit/page.tsx", "utf8");
    expect(src).not.toMatch(/formatDate[^;]*from "@\/components\/app\/api"/);
  });
});
