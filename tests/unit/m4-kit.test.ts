import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCasaKit } from "@/lib/casa-kit";
import { createZip, crc32, readZip } from "@/lib/zip";
import { generateSdk } from "@/lib/sdk-gen";
import { buildOpenApi } from "@/lib/openapi";

describe("zip writer", () => {
  it("crc32 matches the reference value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
  it("round-trips text, binary and unicode names; stores incompressible data as is", () => {
    const bin = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 37) % 251));
    const zip = createZip([{ name: "a.txt", data: "hello ".repeat(200) }, { name: "dir/ü.bin", data: bin }, { name: "empty", data: "" }], new Date("2026-11-05T00:00:00Z"));
    expect([zip.readUInt32LE(0), zip.readUInt16LE(8)]).toEqual([0x04034b50, 8]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["a.txt", "dir/ü.bin", "empty"]);
    expect(files.get("a.txt")!.toString()).toBe("hello ".repeat(200));
    expect(files.get("dir/ü.bin")!.equals(bin)).toBe(true);
    expect(files.get("empty")!.length).toBe(0);
  });
  it("detects corruption and refuses path traversal", () => {
    const zip = createZip([{ name: "a.txt", data: "abcdefghij" }]); // 10 distinct bytes: deflate is larger, so the body is stored as is
    const bad = Buffer.from(zip);
    const at = bad.indexOf(Buffer.from("abcdefghij"));
    expect(at).toBeGreaterThan(0);
    bad[at] ^= 0xff;
    expect(() => readZip(bad)).toThrow();
    for (const name of ["../x", "/etc/passwd", "a\\b"]) expect(() => createZip([{ name, data: "x" }])).toThrow(/unsafe/);
  });
  it("is deterministic for the same inputs", () => {
    const e = [{ name: "a", data: "b" }];
    expect(createZip(e, new Date(0)).equals(createZip(e, new Date(0)))).toBe(true);
  });
});

describe("CASA Readiness Kit", () => {
  const zip = buildCasaKit({ version: "1.2.3", date: "2026-11-05" });
  const files = readZip(zip);
  const text = (n: string) => files.get(n)!.toString("utf8");

  it("contains the checklist, templates, evidence index, notes and ZAP config", () => {
    expect([...files.keys()].sort()).toEqual([
      "01-saq-checklist.md", "02-data-flow-template.md", "03-data-inventory-template.md", "04-evidence-index.md", "05-encryption-notes.md",
      "06-deletion-evidence.md", "07-architecture.md", "README.md", "manifest.json", "zap/zap-baseline.conf",
    ]);
  });
  it("manifest hashes match every file and carry the version", () => {
    const m = JSON.parse(text("manifest.json")) as { version: string; generated: string; files: { path: string; sha256: string; bytes: number }[] };
    expect(m).toMatchObject({ version: "1.2.3", generated: "2026-11-05" });
    expect(m.files).toHaveLength(9);
    for (const f of m.files) {
      expect(createHash("sha256").update(files.get(f.path)!).digest("hex")).toBe(f.sha256);
      expect(files.get(f.path)!.length).toBe(f.bytes);
    }
  });
  it("is honest: names the limits, claims no certification, ships blanks for the customer's part", () => {
    expect(text("README.md")).toMatch(/You still hire your own assessor/);
    expect(text("README.md")).toMatch(/not a compliance certificate/);
    expect(text("04-evidence-index.md")).toMatch(/Attached to the GitHub release/);
    expect(text("03-data-inventory-template.md")).toMatch(/Your application \(fill in\)/);
    expect(text("02-data-flow-template.md")).toMatch(/Your application \(fill in\)/);
    const all = [...files.values()].map((b) => b.toString()).join("\n");
    expect(all).not.toMatch(/SOC ?2 (certified|compliant)|ISO ?27001 (certified|compliant)/i);
    expect(text("06-deletion-evidence.md")).toMatch(/DELETE \/v1\/accounts/);
    expect(text("zap/zap-baseline.conf")).toMatch(/zap-baseline\.py/);
  });
  it("is served at /casa/kit.zip as an attachment", async () => {
    const { GET } = await import("@/app/(marketing)/casa/kit.zip/route");
    const r = GET();
    expect(r.headers.get("content-type")).toBe("application/zip");
    expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename="inboxwire-casa-kit-.+\.zip"$/);
    expect(readZip(Buffer.from(await r.arrayBuffer())).has("README.md")).toBe(true);
  });
});

describe("generated SDK", () => {
  it("packages/sdk/src/generated.ts is in sync with the OpenAPI document (run npm run sdk:generate)", () => {
    const want = generateSdk(buildOpenApi("https://inboxwire.buffersoltech.com") as Record<string, unknown>);
    expect(readFileSync("packages/sdk/src/generated.ts", "utf8")).toBe(want);
  });
  it("has a typed method for every operation", () => {
    const src = readFileSync("packages/sdk/src/generated.ts", "utf8");
    for (const id of ["listAccounts", "deleteAccount", "getUsage", "sendMessage", "replayDelivery", "createConnectLink"]) expect(src).toContain(`  ${id}(`);
    expect(src).toContain("export type ApiError");
  });
});
