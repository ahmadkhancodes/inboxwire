import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const acceptableUse: LegalDoc = {
  slug: "acceptable-use",
  title: "Acceptable use policy",
  description: `What you may and may not do with ${p.fullName}.`,
  sections: [
    {
      id: "purpose",
      title: "Purpose",
      body: [
        `${p.fullName} gives software teams API access to mailboxes that their users have authorized. This policy protects those users, mail providers and the service. It applies to you and to anyone using your account or API keys.`,
      ],
    },
    {
      id: "authorization",
      title: "Authorization and consent",
      body: [
        "Connect a mailbox only when its owner has clearly authorized your application to access it, for the purpose you described to them. Do not collect credentials through deceptive screens, and do not access a mailbox after authorization is withdrawn.",
      ],
    },
    {
      id: "prohibited",
      title: "You must not",
      body: [
        {
          list: [
            "use the service for spam, phishing, fraud, impersonation or bulk unsolicited email;",
            "send messages that break the law or the rules of the mail provider you send through;",
            "sell mailbox data, use it for advertising, or use it to train models in ways the mailbox owner has not authorized;",
            "break or work around the terms, scopes, quotas or review requirements of Google, Microsoft or any other provider;",
            "attempt to read data of other customers, probe or attack the service, or avoid rate limits and plan limits;",
            "reverse engineer, resell or share a self-host licence key outside the licence terms;",
            "upload malware or use the service to attack other systems;",
            "use the service in a way that harms the stability or security of the platform.",
          ],
        },
      ],
    },
    {
      id: "enforcement",
      title: "Enforcement",
      body: [
        `We may investigate suspected violations and suspend or end access, with notice where we reasonably can and immediately where there is a risk to users or the service. We may report unlawful activity to the authorities. To report abuse, write to ${p.legalEmail}.`,
      ],
    },
  ],
};
