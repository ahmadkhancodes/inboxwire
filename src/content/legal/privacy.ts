import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const privacy: LegalDoc = {
  slug: "privacy",
  title: "Privacy policy",
  description: `How ${p.fullName} collects, uses and protects personal data, and the rights you have over it.`,
  sections: [
    {
      id: "who-we-are",
      title: "Who we are",
      body: [
        `${p.fullName} is operated by ${p.legal.entity}, ${p.legal.address}. This policy explains what personal data we handle when you visit ${p.host}, create an account or use the service.`,
        `${p.name} is an API and webhook service that lets software teams read, sync and send email from their own users' Gmail, Microsoft 365 and IMAP mailboxes. We have two roles. For account and billing data we are the controller. For mailbox data that your users connect through your application, you are the controller and we are your processor. The data processing addendum covers the second role.`,
      ],
    },
    {
      id: "data-we-collect",
      title: "Data we collect",
      body: [
        "We collect only what we need to run the service.",
        {
          list: [
            "Account data: your email address, name if you give one, and sign in settings such as two factor.",
            "Organization data: workspace name, members, roles, environments, API keys (stored hashed, never in plain text) and the settings you configure.",
            "Connected mailbox metadata: for each mailbox your users connect, its address, provider, connection state and an index of message metadata such as folder, date, sender, flags and thread. We do not store message bodies by default.",
            "Mailbox credentials: OAuth access and refresh tokens, and IMAP or SMTP credentials where used. These are encrypted before they are stored.",
            "Your OAuth client credentials: if you bring your own Google or Microsoft OAuth client, its secret is stored encrypted.",
            "Webhook delivery logs: each delivery attempt to your endpoints, with status, latency and a short response snippet, kept for up to 90 days.",
            "Billing data: your plan and subscription status. Card details go straight to Stripe and never touch our servers.",
            "Technical data: IP address, browser type and request logs, kept briefly for security, abuse prevention and debugging. We do not log message bodies.",
          ],
        },
        "We do not sell personal data. We show no advertising and we do not use mailbox data for advertising. We do not use any large language model on mailbox data and we do not use it to train models.",
      ],
    },
    {
      id: "mailbox-data",
      title: "How mailbox data is handled",
      body: [
        "Mailbox content is processed only to provide the features you use through the API: syncing, searching, reading, sending and notifying your webhooks when mail arrives. No person at BufferSol reads mailbox content. Access to production data by our staff is limited to what is needed to keep the service running and is not used to view message content.",
        "Message bodies are not stored by default. Where a request or event needs content, it passes through the service and the encrypted payload of a queued send is deleted as soon as it is sent or fails (outbox records without content are kept 7 days for idempotency).",
        `The use and transfer of information received from Google APIs to any other app by ${p.fullName} adheres to the Google API Services User Data Policy, including the Limited Use requirements. We use Google user data only to provide and improve the user facing features you request, we do not transfer it to others except as needed to provide those features, to comply with law or as part of a merger, and we do not use it for advertising or sell it.`,
        "Google access runs through the OAuth client that you create in your own Google Cloud project. You decide the scopes and are responsible for your own Google verification and security assessment.",
      ],
    },
    {
      id: "how-we-use-it",
      title: "How we use it and our legal bases",
      body: [
        "If you are in the European Economic Area or the United Kingdom, we rely on these legal bases under the GDPR and UK GDPR.",
        {
          list: [
            "Contract: to create your account, run the API and webhooks, and bill you.",
            "Legitimate interests: to secure the service, prevent abuse, fix faults and keep records of our own business.",
            "Legal obligation: to keep tax and accounting records.",
            "Consent: for optional email from us that is not part of the service, which you can withdraw at any time.",
          ],
        },
        "We also use account data to send service messages such as sign in links, security alerts and billing notices.",
      ],
    },
    {
      id: "sharing",
      title: "Who we share it with",
      body: [
        `We share data only with the subprocessors listed on our subprocessors page, who help us host, store and bill. We may disclose data if the law requires it, and we will tell you first where we are allowed to. Mail providers you connect, such as Google and Microsoft, receive the API requests needed to read and send mail.`,
      ],
    },
    {
      id: "retention",
      title: "Retention and deletion",
      body: [
        "We keep account data while your account is active. Webhook delivery logs are kept for up to 90 days.",
        "You can delete a connected mailbox with the deletion API (DELETE /v1/accounts/{id}). It revokes the stored token and deletes the related rows, and we keep a deletion record. If you cancel your subscription, we revoke tokens and delete your data 30 days after the end of the paid period. Backups are overwritten on their normal schedule. We keep billing records as long as the law requires.",
      ],
    },
    {
      id: "transfers",
      title: "International transfers",
      body: [
        "Our hosting is in the United States. Where we transfer personal data from the EEA or UK, we use appropriate safeguards such as standard contractual clauses and the UK addendum, as described in the data processing addendum.",
      ],
    },
    {
      id: "security",
      title: "Security",
      body: ["We encrypt credentials and sensitive payloads with envelope encryption and protect data in transit with TLS. See the security page for details. No system is perfectly secure, and we will notify you of a breach as the law requires."],
    },
    {
      id: "rights",
      title: "Your rights",
      body: [
        "Depending on where you live, you may have the right to access, correct, delete, export or restrict the use of your personal data, to object to processing, and to complain to your data protection authority. California residents have rights under the CCPA and CPRA, and we do not sell or share personal data for cross context advertising.",
        `To use a right over account data, write to ${p.legalEmail}. If your request concerns mailbox data that your application's users connected, we may refer you to the customer that operates that application, because that customer is the controller.`,
      ],
    },
    {
      id: "children",
      title: "Children",
      body: [`${p.name} is for businesses and is not directed to children under 16. We do not knowingly collect their data.`],
    },
    {
      id: "changes",
      title: "Changes",
      body: [`We will post changes here and update the effective date, ${p.legal.effectiveDate}. We will email account owners about material changes.`],
    },
    {
      id: "contact",
      title: "Contact",
      body: [`${p.legal.entity}, ${p.legal.address}. Email: ${p.legalEmail}.`],
    },
  ],
};
