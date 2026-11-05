import { product } from "@/config/product";
import type { CompareValue } from "@/components/marketing/compare-table";

export interface CompareEntry {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  rows: { label: string; values: [CompareValue, CompareValue] }[];
  /** "Where they are better" comes first on every compare page (brief voice rules). */
  fitNote: string;
  faq: { q: string; a: string }[];
}

const NOT_AFFILIATED = "Inboxwire by BufferSol is not affiliated with Postal Systems OU.";
const DATE = "Prices read 3 Nov 2026.";

/** Compare-page data: add an entry and /compare/<slug> exists. Facts from docs/brief.md only; unverified cells stay {{verify}}. */
export const comparisons: CompareEntry[] = [
  {
    slug: "emailengine",
    competitor: "EmailEngine",
    title: `${product.fullName} vs EmailEngine`,
    description: `${product.fullName} and EmailEngine compared on price, hosting, delivery log, billing and scaling. ${DATE}`,
    headline: `${product.fullName} vs EmailEngine`,
    intro: `Both give your app one REST API and webhooks over Gmail, Microsoft 365 and IMAP. EmailEngine is mature and self-hosted only. ${NOT_AFFILIATED} ${DATE}`,
    rows: [
      { label: "Price", values: ["$1,450 a year, annual only", "$708 a year self-host, or Cloud from $24.99 a month"] },
      { label: "Hosted option", values: [false, true] },
      { label: "Self-hosted", values: [true, true] },
      { label: "Free tier", values: ["14 day trial", "3 mailboxes, forever"] },
      { label: "Monthly billing", values: [false, true] },
      { label: "Webhook delivery log with replay", values: ["Last 500 failures for 7 days", "Full log, one-click replay"] },
      { label: "Horizontal scaling", values: ["Single instance", "Planned for v1"] },
      { label: "CASA Readiness Kit", values: [false, "Free on every plan"] },
      { label: "Source", values: ["Source-available, commercial", "Commercial"] },
    ],
    fitNote: "Where EmailEngine is the better choice: it has been in production since 2020, it is built by the author of Nodemailer, and it ships a release every few days. If you want the most battle-tested self-hosted option and price is not the deciding factor, it is a safe pick.",
    faq: [
      { q: "Is Inboxwire by BufferSol affiliated with EmailEngine?", a: NOT_AFFILIATED },
      { q: "Does self-hosting remove the Google CASA requirement?", a: "No, with either product. CASA applies to your own OAuth app." },
      { q: "Is Inboxwire by BufferSol half the price?", a: `$708 a year against $1,450 a year for the self-hosted licence. ${DATE}` },
    ],
  },
  {
    slug: "nylas",
    competitor: "Nylas",
    title: `${product.fullName} vs Nylas`,
    description: `${product.fullName} and Nylas compared on mailbox pricing, hosting, data storage and scope. ${DATE}`,
    headline: `${product.fullName} vs Nylas`,
    intro: `Nylas is the broadest hosted API. We cover Gmail, Microsoft 365 and IMAP only, priced per plan rather than climbing with every account. ${DATE}`,
    rows: [
      { label: "Pro plan", values: ["$49 a month for 25 accounts ($43 billed annually)", "Cloud Growth $99.99 a month for 100 mailboxes"] },
      { label: "Extra account", values: ["$2.00 a month ($1.75 annual)", "$0.99 a month"] },
      { label: "Free tier", values: ["5 accounts", "3 mailboxes"] },
      { label: "Self-hosted", values: ["Partial", true] },
      { label: "Calendar and contacts", values: [true, false] },
      { label: "EWS, iCloud, Yahoo", values: [true, false] },
      { label: "Mail copies stored in vendor cloud", values: [true, "Metadata only by default"] },
      { label: "CASA Readiness Kit", values: [false, "Free on every plan"] },
    ],
    fitNote: "Where Nylas is the better choice: you need calendar or contacts, EWS, iCloud or Yahoo, SOC 2 or ISO attestations today, or a shared CASA-verified Google app so you never run your own assessment. Choose Nylas if you need calendar or EWS.",
    faq: [
      { q: "Do I still need CASA with Inboxwire by BufferSol?", a: "If your Gmail app uses restricted scopes for external users, yes. We provide a free readiness kit for our part and never resell an assessment. Nylas sells a shared verified app as an add-on." },
      { q: "Where is mail stored?", a: "Inboxwire by BufferSol stores metadata only by default and never logs message bodies." },
    ],
  },
  {
    slug: "unipile",
    competitor: "Unipile",
    title: `${product.fullName} vs Unipile`,
    description: `${product.fullName} and Unipile compared for email-only use. ${DATE}`,
    headline: `${product.fullName} vs Unipile`,
    intro: `Unipile spans email plus LinkedIn and WhatsApp. If email is your only channel, the per-account price matters. ${DATE}`,
    rows: [
      { label: "Price model", values: ["EUR 5 per account a month for 11 to 50 accounts, minimum EUR 49 a month including 10", "Plans from $24.99 a month for 25 mailboxes"] },
      { label: "Self-hosted", values: [false, true] },
      { label: "Free tier", values: ["7 day trial", "3 mailboxes, forever"] },
      { label: "Channels beyond email", values: ["LinkedIn, WhatsApp and more", false] },
      { label: "CASA", values: ["Tier 2 included", "Readiness Kit, you hire the lab"] },
    ],
    fitNote: "Where Unipile is the better choice: you also need LinkedIn or WhatsApp, hosted auth in one API, or CASA handled for you.",
    faq: [{ q: "Which is cheaper for 50 mailboxes?", a: `Cloud Starter covers 25 mailboxes at $24.99 a month and Growth covers 100 at $99.99 a month. Unipile lists EUR 5 per account for 11 to 50 accounts. ${DATE}` }],
  },
];

export const comparisonBySlug = (slug: string) => comparisons.find((c) => c.slug === slug);
export const compareEntries = comparisons;
