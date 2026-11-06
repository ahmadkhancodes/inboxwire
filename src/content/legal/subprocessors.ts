import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const subprocessors: LegalDoc = {
  slug: "subprocessors",
  title: "Subprocessors",
  description: `The third parties ${p.fullName} uses to process personal data.`,
  sections: [
    {
      id: "list",
      title: "Current subprocessors",
      body: [
        `${p.legal.entity} uses these providers to run ${p.name}. Mailbox content is not sent to any of them for analysis or advertising.`,
        {
          table: {
            head: ["Provider", "Purpose", "Location"],
            rows: p.subProcessors.map((s) => [s.name, s.purpose, s.location]),
          },
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to this list",
      body: [`We will notify account owners before we add or replace a subprocessor, and will update this page. To object, write to ${p.legalEmail}. Mail providers that you connect (Google, Microsoft or your IMAP host) are your own providers, not our subprocessors.`],
    },
  ],
};
