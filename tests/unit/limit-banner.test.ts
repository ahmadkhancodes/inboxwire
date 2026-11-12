import { describe, expect, it } from "vitest";
import { usageState } from "@/lib/billing/usage";
import { limitNotice } from "@/components/app/usage-banner";
import { METER_LABELS } from "@/components/app/labels";
import type { MeterId } from "@/config/product";

const METERS: MeterId[] = ["mailboxes", "environments", "seats"];

describe("limit states per resource: under, exactly at, over", () => {
  for (const m of METERS) {
    const plural = METER_LABELS[m].plural;
    it(`${m}: under the limit is ok, no banner level`, () => {
      expect(usageState(m, 0, 5).level).toBe("ok");
      expect(usageState(m, 3, 5).level).toBe("ok");
    });
    it(`${m}: exactly at the limit is calm and neutral, never red`, () => {
      for (const limit of [1, 3, 10]) {
        const s = usageState(m, limit, limit);
        expect(s.level).toBe("at");
        const n = limitNotice(s);
        expect(n.tone).toBe("info");
        expect(n.title).toBeUndefined();
        expect(n.body).toContain(`You are using all ${limit} `);
        expect(n.body).toContain("Upgrade when you need more.");
        expect(n.body).not.toMatch(/over your limit/i);
      }
      expect(limitNotice(usageState(m, 1, 1)).body).toContain(plural === "environments" ? "all 1 environment." : "all 1 ");
    });
    it(`${m}: strictly over is red and says what is blocked`, () => {
      const s = usageState(m, 4, 3);
      expect(s.level).toBe("over");
      const n = limitNotice(s);
      expect(n.tone).toBe("danger");
      expect(n.title).toBe("You are over your limit");
      expect(n.body).toContain("You have used 4 of 3");
      expect(n.body).toMatch(/blocked|refused|billed/);
    });
  }
  it("near is a warning, 0 of 0 is ok", () => {
    expect(usageState("seats", 9, 10).level).toBe("near");
    expect(limitNotice(usageState("seats", 9, 10)).tone).toBe("warning");
    expect(usageState("seats", 0, 0).level).toBe("ok");
  });
});
