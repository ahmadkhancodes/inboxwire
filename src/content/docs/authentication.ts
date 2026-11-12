import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const authentication: DocPage = {
  slug: "authentication",
  title: "Authentication",
  description: `Sign in to ${p.name} with magic links, passkeys and two factor, and call the API with keys.`,
  sections: [
    {
      heading: "Magic link",
      body: [
        "Enter your email on the sign in page and we send a one time link. The link expires after a short time and works once. Open it on the same device where you asked for it for the smoothest experience.",
      ],
    },
    {
      heading: "Passkeys",
      body: [
        "Add a passkey under Security in the dashboard. After that you can sign in with your fingerprint, face or device PIN. Passkeys are bound to this site, so they cannot be phished. We recommend adding at least two.",
      ],
    },
    {
      heading: "Two factor authentication",
      body: [
        "Turn on two factor under Security in the dashboard. Scan the QR code with an authenticator app and enter the six digit code to confirm. Save your recovery codes somewhere safe. Each works once if you lose your device.",
      ],
    },
    {
      heading: "API keys",
      body: [
        "Server to server requests use API keys. Create and revoke them under Keys in the dashboard. Send the key as Authorization: Bearer <key> (or in the x-api-key header) on every request. Never put a key in browser code or a public repository. If a key leaks, revoke it and create a new one.",
        "Each key has a scope (read, send or admin) and, by default, one environment. A key bound to production answers 403 environment_not_allowed if it sends x-environment: development. Keys created with \"Any environment\" pick the environment per request with the x-environment header (production when it is missing).",
      ],
      code: {
        lang: "bash",
        code: `curl ${p.url}/v1/me \\\n  -H "x-api-key: $INBOXWIRE_KEY"`,
      },
    },
  ],
};
