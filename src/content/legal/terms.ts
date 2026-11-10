import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const terms: LegalDoc = {
  slug: "terms",
  title: "Terms of service",
  description: `The agreement between you and ${p.legal.entity} for using ${p.fullName}.`,
  sections: [
    {
      id: "agreement",
      title: "Agreement",
      body: [
        `These terms are a contract between you and ${p.legal.entity}, ${p.legal.address} ("we"). They apply to ${p.fullName}, including the REST API, webhooks, dashboard, hosted connect page and documentation, at ${p.host}. By creating an account or using the service you accept them. If you accept for a company, you confirm you can bind it. The terms are effective ${p.legal.effectiveDate}.`,
      ],
    },
    {
      id: "service",
      title: "The service",
      body: [
        `${p.name} gives your application one REST API and signed webhooks over the Gmail, Microsoft 365 and IMAP mailboxes that your users connect. It is available as a hosted service (Cloud) and as a self-hosted licence. Plans, limits and prices are on our pricing page. These terms cover the hosted service. Self-hosted licences are also subject to the licence terms delivered with them.`,
        "We may change features and will give notice of changes that materially reduce what your plan includes.",
      ],
    },
    {
      id: "accounts",
      title: "Your account",
      body: [
        "Give accurate information and keep your credentials and API keys safe. You are responsible for activity under your account and keys. Tell us promptly if you think they were compromised.",
      ],
    },
    {
      id: "mailboxes",
      title: "Connected mailboxes and your users",
      body: [
        "You are responsible for having a lawful basis and the authorization of each mailbox owner before you connect their mailbox, and for your own privacy notice to them. You are the controller of that data and we process it on your behalf under the data processing addendum.",
        "For Google, you use your own OAuth client and Google Cloud project. You are responsible for its configuration, its Google verification and any security assessment Google requires, and for complying with the Google API Services User Data Policy. For Microsoft, you are responsible for your own app registration and any admin consent. We provide evidence about our own components, but we do not guarantee that Google or Microsoft will approve your application.",
        "Third party providers can change or limit their APIs. We will work to keep up, but we are not responsible for provider outages or changes.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      body: ["You must follow the acceptable use policy. We may suspend access that breaks it or puts the service or other customers at risk."],
    },
    {
      id: "fees",
      title: "Plans, fees and billing",
      body: [
        "Paid Cloud plans and self-host licences are billed in advance through Stripe, monthly or annually as you choose. Fees exclude sales tax and VAT unless stated. The Developer plan is free and subject to its limits.",
        "Subscriptions renew until canceled. You can cancel at any time and the cancellation takes effect at the end of the paid period. Fees already paid are not refunded unless the law requires it. If a payment fails, your plan continues for a grace period of " + p.graceDays + " days, after which limits fall to those of the Developer plan.",
        "Self-host licences work offline. If a payment is refunded in full, the subscription ends and no new licence is issued, but a licence already issued stays valid until its own expiry date plus the 30 day grace period. We do not revoke issued licences remotely.",
        "We may change prices for future periods with notice. Self-host prices are locked for the term stated on the pricing page.",
      ],
    },
    {
      id: "data",
      title: "Your data",
      body: [
        "You keep all rights in your data and in your users' data. You give us the right to process it only to provide the service. We do not sell it, show advertising from it or use it to train models.",
        "You can delete connected mailboxes through the deletion API at any time. After cancellation, we revoke tokens and delete your data 30 days after the end of the paid period. Export what you need before then.",
      ],
    },
    {
      id: "ip",
      title: "Our property",
      body: [`${p.name}, its software and its documentation belong to ${p.legal.entity} and its licensors. We grant you a limited, non exclusive, non transferable right to use them for your own business as these terms allow. Feedback you give us may be used without obligation.`],
    },
    {
      id: "availability",
      title: "Availability and support",
      body: [
        "We aim for high availability and publish status on our status page. Unless a signed agreement says otherwise, there is no service level credit. Support channels depend on your plan.",
      ],
    },
    {
      id: "warranty",
      title: "Disclaimer",
      body: [
        'The service is provided "as is" and "as available". To the extent the law allows, we disclaim all implied warranties, including merchantability, fitness for a particular purpose and non infringement. We do not promise that the service will be uninterrupted or error free, or that every message or webhook will be delivered at all times. Webhook delivery is at least once and failed deliveries are retried for a limited period.',
      ],
    },
    {
      id: "liability",
      title: "Limitation of liability",
      body: [
        `To the extent the law allows, neither party is liable for indirect, incidental or consequential damages, or for lost profits or data. Our total liability for all claims is limited to the fees you paid us in the 12 months before the event that gave rise to the claim. Nothing here limits liability that cannot be limited by law.`,
      ],
    },
    {
      id: "indemnity",
      title: "Indemnity",
      body: ["You will defend and indemnify us against third party claims arising from your connection of mailboxes without proper authorization, your breach of these terms or your violation of law or of a provider's terms."],
    },
    {
      id: "termination",
      title: "Suspension and termination",
      body: [
        "You may stop using the service at any time. We may suspend or end access if you materially breach these terms, do not pay, or if required to protect the service or by law. We will give notice where we reasonably can. Sections that by their nature should survive will survive termination.",
      ],
    },
    {
      id: "law",
      title: "Governing law",
      body: [`These terms are governed by the laws of ${p.legal.jurisdiction}, without regard to conflict of law rules. The courts of ${p.legal.jurisdiction} have exclusive jurisdiction, except where the law of your country gives you mandatory rights.`],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: ["We may update these terms. We will email account owners about material changes before they take effect. Continued use after that means you accept the new terms."],
    },
    {
      id: "contact",
      title: "Contact",
      body: [`Questions: ${p.legalEmail}. Support: ${p.supportEmail}.`],
    },
  ],
};
