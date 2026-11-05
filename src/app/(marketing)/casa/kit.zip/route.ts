import { buildCasaKit, kitMeta } from "@/lib/casa-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `/casa/kit.zip`: the CASA Readiness Kit. Free on every plan, no sign-in. */
export function GET() {
  const meta = kitMeta();
  return new Response(new Uint8Array(buildCasaKit(meta)), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="inboxwire-casa-kit-${meta.version}.zip"`,
      "cache-control": "public, max-age=3600",
    },
  });
}
