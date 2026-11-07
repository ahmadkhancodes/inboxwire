import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const security: LegalDoc = {
  slug: "security",
  title: "Security",
  description: `How ${p.fullName} protects mailbox credentials and data.`,
  sections: [
    {
      id: "overview",
      title: "Overview",
      body: [
        `${p.fullName} handles access to your users' mailboxes, so we are conservative about what we keep and how we protect it. This page describes our practices. It is not a certification claim. We do not currently hold a SOC 2 report or offer a business associate agreement.`,
      ],
    },
    {
      id: "minimal-data",
      title: "We store less",
      body: [
        "Message bodies are not stored by default. We keep a metadata index, encrypted credentials and delivery logs. The encrypted payload of a queued send is deleted as soon as the message is sent or fails, outbox records without payload are kept 7 days for idempotency, and we never write message bodies to logs. No person at BufferSol reads mailbox content.",
      ],
    },
    {
      id: "encryption",
      title: "Encryption",
      body: [
        {
          list: [
            "In transit: TLS for the API, dashboard, webhooks and connections to mail providers.",
            "At rest: OAuth tokens, IMAP and SMTP credentials, OAuth client secrets, webhook secrets and queued payloads are encrypted with AES-256-GCM envelope encryption, using a separate data key for each organization. The master key is kept outside the database.",
            "API keys are stored only as hashes. They are shown once when created.",
          ],
        },
      ],
    },
    {
      id: "access",
      title: "Access control",
      body: [
        "API keys are scoped (read, send, admin) and bound to one environment by default. Dashboard members have roles. Connect links are single use and expire after 24 hours. Webhooks are signed with HMAC-SHA256 and a timestamp header so you can verify them. Administrative actions are written to an append-only audit log.",
      ],
    },
    {
      id: "oauth",
      title: "OAuth and provider access",
      body: [
        "You connect Google and Microsoft through your own OAuth clients, so you control the scopes and can revoke access in your own consoles. We request only what the features you use require. Deleting a mailbox revokes its stored token.",
      ],
    },
    {
      id: "development",
      title: "Engineering practice",
      body: [
        "We align our application controls with OWASP ASVS level 2. We scan dependencies and run dynamic scans before releases, and we aim to ship with no high or critical findings. We block webhook deliveries and IMAP/SMTP connections to private, loopback and cloud metadata addresses. We provide a CASA Readiness Kit on every plan with evidence about our own components, to help you with Google's assessment of your application. It does not replace that assessment.",
      ],
    },
    {
      id: "hosting",
      title: "Hosting and subprocessors",
      body: [`The hosted service runs on the providers listed on our subprocessors page, in the United States. Self-hosted customers run it on their own infrastructure and control where data lives.`],
    },
    {
      id: "incidents",
      title: "Incidents",
      body: [`If we confirm a breach affecting your data, we will tell you without undue delay, as described in the data processing addendum. Status is published on our status page.`],
    },
    {
      id: "disclosure",
      title: "Report a vulnerability",
      body: [
        `Email ${p.legalEmail} with the details and steps to reproduce. Please give us reasonable time to fix the issue before disclosing it, and do not access data that is not yours or degrade the service. We will acknowledge good faith reports.`,
      ],
    },
  ],
};
