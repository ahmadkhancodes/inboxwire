import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const dpa: LegalDoc = {
  slug: "dpa",
  title: "Data processing addendum",
  description: `How ${p.fullName} processes personal data on behalf of customers.`,
  sections: [
    {
      id: "scope",
      title: "Scope and roles",
      body: [
        `This addendum forms part of the terms between you ("Customer") and ${p.legal.entity}, ${p.legal.address} ("Processor"). It applies when we process personal data on your behalf through ${p.fullName}. For that data you are the controller (or a processor for your own customers) and we are the processor or sub-processor. For account and billing data we are an independent controller, as described in the privacy policy.`,
      ],
    },
    {
      id: "details",
      title: "Details of processing",
      body: [
        {
          table: {
            head: ["Item", "Description"],
            rows: [
              ["Subject matter", "Providing the email API and webhooks over mailboxes your users connect"],
              ["Duration", "While the account is active, plus up to 30 days after the end of the paid period, then deletion"],
              ["Nature and purpose", "Connecting, syncing, indexing, searching, reading and sending mail, and delivering webhook events, as you instruct through the API"],
              ["Data subjects", "Your users who connect mailboxes, and the people who send mail to or receive mail from those mailboxes"],
              ["Personal data", "Mailbox address, message metadata, OAuth tokens and IMAP or SMTP credentials (encrypted), webhook event payloads and delivery logs, and message content that passes through when you request it"],
            ],
          },
        },
        "Message bodies are not stored by default. We do not process this data to analyze it with any large language model, for advertising, or for any purpose of our own.",
      ],
    },
    {
      id: "instructions",
      title: "Our obligations",
      body: [
        "We will:",
        {
          list: [
            "process personal data only on your documented instructions, which are these terms, the addendum and your use of the API and settings, unless the law requires otherwise, in which case we will tell you first where allowed;",
            "ensure that people authorized to process it are bound by confidentiality, and that no person at BufferSol reads mailbox content as part of normal operation;",
            "apply the security measures described on our security page;",
            "assist you, taking into account the nature of the processing, with data subject requests and with your obligations on security, breach notification and impact assessments;",
            "delete personal data on request through the deletion API, and delete it 30 days after the end of your paid period, and keep a deletion record;",
            "make available the information needed to show compliance and allow reasonable audits, normally through documentation and questionnaires.",
          ],
        },
        "For Google user data, we comply with the Google API Services User Data Policy, including the Limited Use requirements.",
      ],
    },
    {
      id: "customer",
      title: "Your obligations",
      body: [
        "You confirm that you have a lawful basis and any required consent or authorization to connect each mailbox and have it processed through the service, and that your instructions comply with the law. You are responsible for your own OAuth clients, scopes, provider verification and any security assessment a provider requires.",
      ],
    },
    {
      id: "subprocessors",
      title: "Subprocessors",
      body: [
        "You give general authorization for the subprocessors on our subprocessors page. We bind each to data protection terms no less protective than these, and remain responsible for them. We will notify you of changes and you may object on reasonable data protection grounds.",
      ],
    },
    {
      id: "transfers",
      title: "International transfers",
      body: [
        "Our hosting is in the United States. For restricted transfers of personal data from the EEA, we rely on the standard contractual clauses (module two or three, as applicable). For transfers from the UK, we rely on the international data transfer addendum to those clauses. Where you are in a different jurisdiction, we will work with you on an appropriate mechanism.",
      ],
    },
    {
      id: "us-law",
      title: "United States state laws",
      body: [
        "For personal data subject to the CCPA and CPRA, we act as your service provider. We will not sell or share it, retain, use or disclose it outside our direct business relationship with you or for any purpose other than providing the service, or combine it with other data, except as the law allows.",
      ],
    },
    {
      id: "breach",
      title: "Personal data breach",
      body: [`We will notify you without undue delay after we become aware of a breach affecting your personal data, with the information we have to help you meet your own obligations. Contact: ${p.legalEmail}.`],
    },
    {
      id: "return",
      title: "Return and deletion",
      body: ["You can export and delete data through the API during the term. After the term, we delete personal data as set out above, except where the law requires us to keep it."],
    },
    {
      id: "contact",
      title: "Contact and execution",
      body: [`To request a signed copy or to discuss custom terms, write to ${p.legalEmail}.`],
    },
  ],
};
