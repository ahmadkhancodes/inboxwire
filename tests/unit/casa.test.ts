import { describe, expect, it } from "vitest";
import { assessCasa, CASA_DEFAULTS } from "@/lib/casa";

describe("CASA self-assessment", () => {
  it("restricted scopes on a server need CASA", () => {
    expect(assessCasa(CASA_DEFAULTS).verdict).toBe("casa");
  });
  it("internal Workspace, testing and non-Google paths need none", () => {
    expect(assessCasa({ ...CASA_DEFAULTS, workspaceInternal: true }).verdict).toBe("none");
    expect(assessCasa({ ...CASA_DEFAULTS, testingUnder100: true }).verdict).toBe("none");
    expect(assessCasa({ ...CASA_DEFAULTS, gmail: false }).verdict).toBe("none");
  });
  it("send-only is sensitive but not restricted", () => {
    expect(assessCasa({ ...CASA_DEFAULTS, readsMail: false }).verdict).toBe("sensitive-only");
  });
});
