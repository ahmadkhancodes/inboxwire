import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { MailboxSlider } from "@/components/marketing/mailbox-slider";
import { Faq } from "@/components/marketing/faq";
import { ogImages, twitterImages } from "@/lib/seo";
import { product } from "@/config/product";

const title = "Pricing";
const description = `${product.fullName} pricing: free Developer tier, Cloud from $24.99 a month, self-host $708 a year. Dated comparison with EmailEngine and Nylas, read 3 Nov 2026.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/pricing", images: ogImages() },
  twitter: { card: "summary_large_image", images: twitterImages() },
};

const billingFaq = [
  { q: "Can I cancel anytime?", a: "Yes. Cancel in two clicks from your account. Self-host licences stay valid until the end of the term plus 30 days." },
  { q: "Is my price locked?", a: "Yes, for 24 months." },
  { q: "What happens if I go over my mailbox limit on Cloud?", a: "We never disconnect mailboxes for quota. You get an email and an in-app warning at 90 percent, and extra mailboxes are $0.99 each per month, prorated daily." },
  { q: "Do I need a card for the Developer tier?", a: "No. 3 mailboxes, all API features, free forever." },
  { q: "Can I pay monthly instead of yearly?", a: "Self-host and Cloud Growth can be billed monthly or yearly, and annual is pre-selected. Cloud Starter is monthly." },
  { q: "Is the CASA Readiness Kit extra?", a: "No. It is included on every plan, including Developer. You still hire your own assessor; we never resell an assessment." },
];

export default function PricingPage() {
  return (
    <>
      <Section labelledBy="pricing-title">
        <h1 className="sr-only">{title}</h1>
        <PricingTable title="Same core features. About half the price." />
      </Section>
      <Section id="calculator" tone="raised" labelledBy="slider-title">
        <h2 id="slider-title" className="heading-4 md:heading-2 mb-8 text-text md:mb-12">What your mailboxes cost</h2>
        <MailboxSlider />
      </Section>
      <Faq title="Billing questions" items={billingFaq} />
    </>
  );
}
