import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const selfHost: DocPage = {
  slug: "self-host",
  title: "Self-host",
  description: "Run Inboxwire on your own server with Docker Compose and MongoDB, activate it with an offline licence key, and keep it updated.",
  sections: [
    {
      heading: "What you run",
      body: [
        "Three containers: the app (dashboard and API), a small worker that calls the app's cron endpoints every minute, and MongoDB. Nothing leaves your servers except traffic to Gmail, Microsoft and your users' IMAP hosts, and the webhooks you configure.",
        `The Self-host plan is $${(p.plans.find((x) => x.id === "selfhost")!.prices[1]!.usd / 100).toFixed(0)} a year or $${(p.plans.find((x) => x.id === "selfhost")!.prices[0]!.usd / 100).toFixed(2)} a month, with no limit on mailboxes, instances or API calls. The Developer limits apply until a licence key is set.`,
      ],
    },
    {
      heading: "Start it",
      body: ["Generate the four secrets once and keep them: MASTER_KEY wraps the keys that encrypt mailbox credentials, so losing it makes stored credentials unreadable. Then start the stack."],
      code: { lang: "bash", code: `git clone https://github.com/ahmadkhancodes/inboxwire && cd inboxwire\ncat > .env <<EOF\nNEXT_PUBLIC_APP_URL=https://mail.example.com\nBETTER_AUTH_SECRET=$(openssl rand -base64 32)\nMASTER_KEY=$(openssl rand -base64 32)\nCRON_SECRET=$(openssl rand -hex 24)\nALTCHA_HMAC_KEY=$(openssl rand -hex 24)\nADMIN_EMAILS=you@example.com\nEOF\ndocker compose up -d\ndocker compose logs app | grep -i "sign-in"` },
    },
    {
      heading: "First sign-in",
      body: ["Open NEXT_PUBLIC_APP_URL and enter an address from ADMIN_EMAILS. With the default MAIL_PROVIDER=console the magic link is printed in the app log, which is the admin URL. Put the instance behind HTTPS (a reverse proxy such as Caddy or nginx) before connecting real mailboxes: OAuth redirects and webhooks need it."],
    },
    {
      heading: "Activate the licence",
      body: ["Copy the key from Billing on the hosted site (it is issued when the invoice is paid) into INBOXWIRE_LICENCE and restart the app. Keys are verified offline with a public key baked into the image. After expiry you get a 30 day grace period with a banner; after that the instance falls back to Developer limits. Check a key without starting anything:"],
      code: { lang: "bash", code: `docker compose run --rm --entrypoint node app scripts/verify-licence.mjs "$INBOXWIRE_LICENCE"\n# licence valid: plan selfhost, expires 2027-11-05, org ...   (exit 0)\n# exit 2 = in grace period, exit 1 = expired or invalid` },
    },
    {
      heading: "Operate it",
      body: [
        "Back up the mongo-data volume (or run mongodump in the mongo container). Update by changing INBOXWIRE_VERSION and running docker compose pull && docker compose up -d. /api/health is the liveness check; /metrics (Prometheus text) needs METRICS_TOKEN as a bearer token.",
        "Gmail and Microsoft 365 still need your own OAuth clients (OAuth clients in the dashboard), and Google's yearly CASA assessment for restricted scopes applies to your app wherever it runs. The free CASA Readiness Kit is at /casa.",
      ],
    },
  ],
};
