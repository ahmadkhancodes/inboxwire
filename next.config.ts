import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

// Cache Components is off on purpose (docs/DECISIONS.md D-K3): the kit uses classic dynamic rendering
// so auth/session reads (cookies()) need no Suspense boundaries. A product can switch it on later.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The self-host Docker image sets BUILD_STANDALONE=1 for a minimal server bundle; Vercel builds are unaffected.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  serverExternalPackages: ["mongodb", "imapflow", "googleapis", "google-auth-library"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Public API paths: /v1/* is served by the route handlers under /api/v1/*.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: "/api/v1/:path*" }];
  },
  // Browsers ask for /favicon.ico; the real icon is the generated /icon route.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon", permanent: true }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
