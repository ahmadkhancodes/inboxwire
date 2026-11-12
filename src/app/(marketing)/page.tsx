import type { Metadata } from "next";
import { homeConnectCurl } from "@/lib/snippets";
import Link from "next/link";
import { Section } from "@/components/ui/layout";
import { Reveal } from "@/components/ui/reveal";
import {
  Faq, Features, FinalCta, Hero, HowItWorks, PricingTable, Problem, ProofFacts, TaglineReveal,
  type FaqItem, type Feature, type ProblemItem, type ProofFact, type Step,
} from "@/components/marketing";
import { LinesTicker, Tape } from "@/components/marketing/demo/lines-ticker";
import { ogImages, twitterImages } from "@/lib/seo";
import { product } from "@/config/product";

export const metadata: Metadata = {
  title: { absolute: `${product.fullName}: email sync API for Gmail, Microsoft 365 and IMAP` },
  description: product.description,
  alternates: { canonical: "/" },
  openGraph: { title: `${product.fullName}: ${product.tagline}`, description: product.description, url: "/", images: ogImages() },
  twitter: { card: "summary_large_image", images: twitterImages() },
};

const problems: ProblemItem[] = [
  { pain: "Our mailbox bill grows with every customer we win.", detail: "APIs priced per mailbox charge for every connected account. Here the Developer tier is free for 3 mailboxes, running it on your servers is $708 a year with unlimited mailboxes, and Cloud extras are $0.99 each." },
  { pain: "IMAP drops at 3 a.m. and nobody knows which mailbox.", detail: "Every mailbox is a line with a state: live, syncing, throttled or auth error. An auth error says why Google or Microsoft rejected it and gives you the reconnect link." },
  { pain: "Google's yearly security assessment surprised us after launch.", detail: "Gmail for external users needs CASA for your own app. We give you the evidence for our part for free, and tell you up front which paths need no assessment at all." },
];

const curl = homeConnectCurl(`https://${product.host}`);

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto border border-border-strong bg-surface-raised p-4 font-mono caption-5 text-text" tabIndex={0}>
      <code>{children}</code>
    </pre>
  );
}

function ConnectFragment() {
  return (
    <div className="flex max-w-md flex-col gap-3 border border-border-strong bg-surface-raised p-4">
      <p className="title-4 text-text">Connect your mailbox</p>
      <p className="body-6 text-text-subtle">Type your email and we pick the right provider.</p>
      <div className="rounded-sm border border-text bg-surface px-3 py-2 font-mono caption-5 text-text">dana@harbor-law.example</div>
      <p className="font-mono caption-5 text-text-subtle">Detected: Microsoft 365 · next: consent screen</p>
    </div>
  );
}

const steps: Step[] = [
  { title: "Create a connect link", body: "One call returns a link that works once, valid for 24 hours. Send it to your user. No IMAP or OAuth code on your side.", visual: <Code>{curl}</Code> },
  { title: "Your user connects a mailbox", body: "They pick Google or Microsoft, or type an address and we detect the provider. Wrong IMAP password? They see it before anything is saved.", visual: <ConnectFragment /> },
  { title: "A signed webhook fires", body: "Each new message prints on the ticker with its delivery stamp. If your endpoint was down, replay the missed events in one click.", visual: <div className="border border-border-strong"><Tape /></div> },
];

const features: Feature[] = [
  { title: "Delivery log with replay in one click", body: "Every webhook attempt keeps its request, response and latency. Filter by status and replay one event or a whole time window.", visual: <Tape /> },
  { title: "Hosted by us or on your servers", body: "The same codebase as a Docker image with a licence key, or run by us. Pick per project." },
  { title: "Free CASA Readiness Kit", body: "SAQ mapping for our components, scan configuration and report, deletion evidence and encryption notes. On every plan, including Developer." },
  { title: "One REST API, one search syntax", body: "Gmail, Microsoft 365 and any IMAP server behind the same endpoints and the same JSON. from:, to:, subject:, after: and has:attachment become IMAP SEARCH, Gmail q and Graph filters." },
  { title: "Send as the user, threaded", body: "Reply or forward by message id so Gmail shows it in the same thread. Idempotency-Key makes retries safe." },
];

const proofFacts: ProofFact[] = [
  { title: "Docs that run", body: "Every sample in the docs, from curl to the TypeScript SDK and the webhook verifiers, is executed by our test suite.", href: "/docs", linkLabel: "Read the docs" },
  { title: "A public status page", body: "Our uptime checks are published where anyone can read them, not behind a login.", href: "/status", linkLabel: "Open the status page" },
  { title: "Every subprocessor named", body: "The companies that host or touch your data are listed by name, purpose and location.", href: "/legal/subprocessors", linkLabel: "See the subprocessors" },
];

const faq: FaqItem[] = [
  { q: "Can a small vendor keep up with Gmail and Microsoft changes?", a: "We track Google and Microsoft changelogs weekly, run contract tests against recorded provider responses, and publish a changelog. That is the whole job of this product." },
  { q: "Will you exist in two years?", a: "We can't promise that for anyone. What we do promise: your price is locked for 24 months, and licences for your own servers keep working offline through the end of the term plus a 30 day grace period." },
  { q: "Is running it on my own servers a way around Google's CASA assessment?", a: "No. CASA applies to your OAuth app, wherever the code runs. Some paths need none: apps that only send, Workspace internal apps, testing under 100 users, and IMAP with app passwords. The CASA Readiness Kit shows which one you are." },
  { q: "Is this overkill for 5 mailboxes?", a: "The Developer tier is free for 3 mailboxes with every API feature. A Workspace internal OAuth app needs no Google verification at all." },
  { q: "Why is it cheaper than EmailEngine and Nylas?", a: "One engineer, no sales team, no calendar or contacts product to carry. Compared with the $1,450 a year licence at emailengine.app and Nylas' published Pro rates, read 3 Nov 2026." },
  { q: "Is my users' email safe?", a: "We store metadata only by default. Credentials are envelope encrypted with a key per organization, no human reads mail, and a deletion API removes an account and revokes its token." },
  { q: "What happens if I exceed my mailbox limit on Cloud?", a: "Nothing breaks. We never disconnect mailboxes for quota. You get an email and a warning in the app at 90 percent, and extra mailboxes are billed at $0.99 each." },
  { q: "Is Inboxwire by BufferSol affiliated with EmailEngine?", a: "No. Inboxwire by BufferSol is not affiliated with Postal Systems OU. We use ImapFlow, Nodemailer and the provider SDKs, and we did not consult EmailEngine source." },
];

export default function HomePage() {
  return (
    <>
      <Hero
        fields={[["From", "Inboxwire by BufferSol"], ["To", "Backend teams whose product reads their users’ email"]]}
        title={<><span className="relative z-10">Read, sync and send from</span>{" "}<br className="max-sm:hidden" /><span className="bg-mark box-decoration-clone px-1">your users&rsquo; mailboxes</span></>}
        subtitle="One REST API and signed webhooks over Gmail, Microsoft 365 and IMAP. Run it on your servers for $708 a year, or let us run it from $24.99 a month."
        primaryCta={{ href: "/sign-in", label: "Start free" }}
        proof={<>Free Developer tier: 3 mailboxes, all API features, no card. Market check: $1,450 a year at emailengine.app, read 3 Nov 2026.</>}
        visual={<LinesTicker />}
      />
      <Problem
        title="Mailbox sync is months of the wrong work"
        intro="IMAP edge cases, OAuth refresh tokens, Gmail history, Graph subscriptions that expire, MIME. None of it is your product."
        items={problems}
      />
      <HowItWorks title="From connect link to signed webhook" steps={steps} />
      <TaglineReveal label="Data handling" text="Nothing outsourced. Your users' mail is handled only by our code: it never goes to AI APIs, ad networks or analytics tools. Every subprocessor is named on our subprocessors page." />
      <Features title="What the API does, on every plan" items={features} />
      <ProofFacts title="Proof you can check yourself" items={proofFacts} />
      <Section field="CASA" labelledBy="casa-title" tone="sunken">
        <div className="grid gap-8 lg:grid-cols-10 lg:gap-x-6">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <h2 id="casa-title" className="heading-4 md:heading-3 text-text">The security assessment, without the surprise</h2>
            <p className="body-3 text-text-subtle">Gmail for external users needs Google&rsquo;s yearly security assessment (CASA) for your app. We give you the evidence for our part, free, on every plan. Some apps don&rsquo;t need it at all: apps that only send, Workspace internal apps, or IMAP. We&rsquo;ll tell you which you are.</p>
            <Link href="/casa" className="inline-flex min-h-11 w-fit items-center button-md text-text underline decoration-2 underline-offset-4 focus-visible:focus-ring">See the CASA Readiness Kit</Link>
          </div>
          <Reveal className="lg:col-span-6">
            <p className="mb-2 font-mono caption-5 text-text-muted">Paths that need no assessment</p>
            <dl className="grid gap-px border border-border-strong bg-border sm:grid-cols-2">
              {[
                ["Apps that only send", "gmail.send is a sensitive scope, not restricted. No CASA."],
                ["Workspace internal", "An Internal OAuth app needs no Google verification."],
                ["Testing mode", "Up to 100 test users, no assessment."],
                ["IMAP with app passwords", "No Google OAuth app involved."],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 bg-surface-raised p-4">
                  <dt className="title-4 text-text">{k}</dt>
                  <dd className="body-6 text-text-subtle">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </Section>
      <Section field="Pricing" labelledBy="pricing-title" size="lg">
        <PricingTable title="Same core features. About half the price." />
        <p className="caption-2 mt-6 max-w-2xl text-text-subtle">Compared with the $1,450 a year licence at emailengine.app and Nylas&rsquo; published Pro rates, read 3 Nov 2026. Your price is locked for 24 months. Cancel in two clicks.</p>
      </Section>
      <Section field="Fit" labelledBy="fit-title" size="sm">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-x-6">
          <div className="flex flex-col gap-3">
            <h2 id="fit-title" className="heading-5 text-text">Built for</h2>
            <p className="body-3 text-text-subtle">Vertical CRMs, shared inbox and helpdesk tools, applicant tracking, AI email agents, regulated workflow software, and email hosts, where mailbox sync is part of your own product.</p>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="heading-5 text-text">Not for</h2>
            <p className="body-3 text-text-subtle">Bulk or cold sending, calendar or contacts or EWS, and getting past Google verification on our app. If you need calendar or EWS, choose Nylas.</p>
          </div>
        </div>
      </Section>
      <Faq items={faq} />
      <FinalCta
        title="Connect a Gmail account and receive a webhook in 5 minutes"
        body="Create a key, create a connect link, watch the ticker."
        cta={{ href: "/sign-in", label: "Start free" }}
        note="Free Developer tier, no card. Cancel paid plans in two clicks."
      />
    </>
  );
}
