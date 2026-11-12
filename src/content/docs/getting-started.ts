import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const gettingStarted: DocPage = {
  slug: "getting-started",
  title: "Getting started",
  description: `Create a ${p.name} account and make your first request in a few minutes.`,
  sections: [
    {
      heading: "Create your account",
      body: [
        `Go to ${p.url} and sign in with your email. We send a magic link, so there is no password to set. Your first sign in creates an organization that holds your data, members and billing.`,
        `New accounts start on the ${p.plans[0]?.name ?? "Free"} plan. You can upgrade from Billing in the dashboard at any time.`,
      ],
    },
    {
      heading: "Create an API key",
      body: [
        "Open Keys in the dashboard and create a key. The full key is shown once, next to a ready-to-run curl command that already contains it, so copy it into your secrets manager straight away. Keys are stored as hashes and cannot be recovered.",
      ],
    },
    {
      heading: "Make your first request",
      body: ["Put the key in an environment variable and send it as a Bearer token (the x-api-key header works too). This call returns the organization the key belongs to."],
      code: {
        lang: "bash",
        code: `export INBOXWIRE_KEY=your_key_here\ncurl ${p.url}/v1/me \\\n  -H "Authorization: Bearer $INBOXWIRE_KEY"`,
      },
    },
    {
      heading: "Next steps",
      body: [
        "Connect your own mailbox from Lines, then Create connect link, to see a line light up without writing code. Add a webhook endpoint to receive events, then follow the quickstart for connect links, search and send from your backend. The authentication guide covers passkeys and two factor sign in.",
      ],
    },
  ],
};
