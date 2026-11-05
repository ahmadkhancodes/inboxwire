import { buildOpenApi } from "@/lib/openapi";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 3600;

/** `GET /v1/openapi.json`: OpenAPI 3.1, generated from the Zod schemas. Public. */
export function GET() {
  return new Response(JSON.stringify(buildOpenApi()), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
