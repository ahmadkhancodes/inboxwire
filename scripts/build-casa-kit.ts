// Writes the CASA Readiness Kit zip: npx tsx scripts/build-casa-kit.ts <version> [out.zip]
import { writeFileSync } from "node:fs";
import { buildCasaKit } from "../src/lib/casa-kit";

const version = process.argv[2] ?? "dev";
const out = process.argv[3] ?? "casa-kit.zip";
writeFileSync(out, buildCasaKit({ version, date: new Date().toISOString().slice(0, 10) }));
console.log(`wrote ${out} (${version})`);
