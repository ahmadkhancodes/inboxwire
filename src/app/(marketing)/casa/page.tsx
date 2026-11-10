import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { CasaCalculator } from "@/components/marketing/casa-calculator";
import { Faq } from "@/components/marketing/faq";
import { ogImages, twitterImages } from "@/lib/seo";
import { product } from "@/config/product";

const title = "Free CASA Readiness Kit";
const description = `Gmail for external users needs Google's yearly security assessment (CASA) for your app. ${product.name} gives you the evidence for our part, free on every plan, and tells you whether you need it at all.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/casa" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/casa", images: ogImages() },
  twitter: { card: "summary_large_image", images: twitterImages() },
};

const kit = [
  { name: "Assessment checklist", body: "Our components mapped to the assessment questions, so you only answer for your own code." },
  { name: "Data-flow and data-inventory templates", body: "Pre-filled for our part, with blanks for yours. Where mail data flows, and where it never goes." },
  { name: "Evidence index", body: "Every item an assessor asks for, where it lives and who holds it. The ZAP configuration is in the zip; the latest report is attached to each tagged release." },
  { name: "Data deletion evidence", body: "How DELETE /v1/accounts/{id} revokes the token and removes rows, with the deletion record." },
  { name: "Encryption notes and architecture", body: "Envelope encryption of tokens at rest, and the components and trust boundaries." },
];

const faq = [
  { q: "Does self-hosting avoid the Google assessment?", a: "No. The assessment is for the OAuth app you register with Google, not for where our code runs. Self-hosting changes who holds the data, not what Google asks of your app." },
  { q: "Do you resell or pay for the assessment?", a: "No. You hire your own assessor and pay them directly. We never resell an assessment, and we do not run a shared verified Google app." },
  { q: "Which apps never need it?", a: "Send-only apps, apps set to Internal inside your own Workspace organisation, apps in Testing under 100 users, and IMAP or SMTP connections with app passwords. Microsoft 365 has no CASA." },
  { q: "Is the kit available on the free plan?", a: "Yes. It is included on every plan, including Developer." },
  { q: "What is not in the zip?", a: "The ZAP report. CI attaches it to each tagged release next to the same version of the kit; the zip lists where to find it. The kit covers our components only." },
];

export default function CasaPage() {
  return (
    <>
      <Section labelledBy="casa-title">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <h1 id="casa-title" className="hero-gradient-text heading-3 md:heading-1">Do you need Google&apos;s CASA assessment?</h1>
          <p className="body-3 text-text-subtle md:title-1">
            Gmail for external users needs Google&apos;s yearly security assessment (CASA) for your app. We give you the evidence for our part, free on every plan. Some apps do not need it at all. Answer five questions and we will tell you which you are.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="#calculator" size="lg">Check my app</ButtonLink>
            <ButtonLink href="/casa/kit.zip" size="lg" variant="secondary" prefetch={false} download>Download the kit (zip)</ButtonLink>
          </div>
        </div>
      </Section>

      <Section id="calculator" tone="raised" labelledBy="casa-calc-title">
        <h2 id="casa-calc-title" className="heading-4 md:heading-2 mb-8 text-text md:mb-12">Self-assessment</h2>
        <CasaCalculator />
      </Section>

      <Section labelledBy="casa-kit-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <h2 id="casa-kit-title" className="heading-4 md:heading-2 text-text">What is in the kit</h2>
            <p className="body-3 text-text-subtle">
              It covers our part only. You still hire your own assessor. Read{" "}
              <a className="underline underline-offset-4 hover:text-text focus-visible:focus-ring" href="https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification" rel="noopener noreferrer">Google&apos;s restricted scope verification policy</a>{" "}
              first.
            </p>
          </div>
          <ol className="lg:col-span-8">
            {kit.map((k, i) => (
              <li key={k.name} className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-border py-6 last:border-b">
                <span className="title-3 tabular-nums text-text-subtle">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="heading-6 text-text">{k.name}</h3>
                  <p className="body-3 mt-1 text-text-subtle">{k.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Faq title="CASA questions" items={faq} />
    </>
  );
}
