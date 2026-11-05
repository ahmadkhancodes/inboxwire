import { createHash } from "node:crypto";
import { kitFiles } from "@/content/casa-kit";
import { createZip } from "./zip";

export interface KitMeta { version: string; date: string }

/** The CASA Readiness Kit as a zip. Deterministic for a given version and date (same bytes, so it can be cached and hashed). */
export function buildCasaKit(meta: KitMeta): Buffer {
  const files = kitFiles(meta);
  const manifest = {
    name: "inboxwire-casa-readiness-kit", version: meta.version, generated: meta.date,
    files: files.map((f) => ({ path: f.path, sha256: createHash("sha256").update(f.body).digest("hex"), bytes: Buffer.byteLength(f.body) })),
  };
  const at = new Date(`${meta.date}T00:00:00Z`);
  return createZip([...files.map((f) => ({ name: f.path, data: f.body })), { name: "manifest.json", data: JSON.stringify(manifest, null, 2) + "\n" }], Number.isNaN(at.getTime()) ? new Date(0) : at);
}

export const kitMeta = (): KitMeta => ({ version: process.env.CASA_KIT_VERSION ?? process.env.npm_package_version ?? "0.1.0", date: process.env.CASA_KIT_DATE ?? new Date().toISOString().slice(0, 10) });
