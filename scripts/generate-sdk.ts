// Regenerates packages/sdk/src/generated.ts from the OpenAPI document: npm run sdk:generate
import { writeFileSync } from "node:fs";
import { buildOpenApi } from "../src/lib/openapi";
import { generateSdk } from "../src/lib/sdk-gen";

writeFileSync(new URL("../packages/sdk/src/generated.ts", import.meta.url), generateSdk(buildOpenApi("https://inboxwire.buffersoltech.com") as Record<string, unknown>));
console.log("wrote packages/sdk/src/generated.ts");
