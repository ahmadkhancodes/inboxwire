/** Self-assessment logic for the /casa page. Client-side only, no network. Not legal advice. */

export interface CasaAnswers {
  /** Which mail provider(s) the app will touch. */
  gmail: boolean;
  /** Needs to read, modify or compose mail (gmail.readonly, gmail.modify, gmail.compose, gmail.metadata, mail.google.com). */
  readsMail: boolean;
  /** Mail data is stored or transmitted through a server. */
  usesServer: boolean;
  /** Only Google Workspace users of your own organisation connect (OAuth app set to Internal). */
  workspaceInternal: boolean;
  /** Fewer than 100 users and the app stays in Testing. */
  testingUnder100: boolean;
}

export type CasaVerdict = "casa" | "sensitive-only" | "none";

export interface CasaResult {
  verdict: CasaVerdict;
  headline: string;
  reasons: string[];
  /** Plain next steps. */
  next: string[];
}

export const CASA_DEFAULTS: CasaAnswers = { gmail: true, readsMail: true, usesServer: true, workspaceInternal: false, testingUnder100: false };

export function assessCasa(a: CasaAnswers): CasaResult {
  if (!a.gmail) {
    return {
      verdict: "none",
      headline: "No Google assessment applies",
      reasons: ["Microsoft 365 and plain IMAP/SMTP connections are not covered by Google's CASA."],
      next: ["Microsoft may require admin consent in your customers' tenants.", "For IMAP, users sign in with app passwords or their provider's OAuth."],
    };
  }
  if (a.workspaceInternal) {
    return {
      verdict: "none",
      headline: "Probably no assessment: internal Workspace app",
      reasons: ["An OAuth app set to Internal and used only inside your own Google Workspace organisation skips public verification and CASA."],
      next: ["Keep the audience set to Internal in the Google Auth Platform.", "If an outside user ever connects, run this check again."],
    };
  }
  if (a.testingUnder100) {
    return {
      verdict: "none",
      headline: "No assessment while you stay in Testing",
      reasons: ["Apps in Testing status are limited to 100 listed test users and refresh tokens expire after 7 days."],
      next: ["Plan the verification work before you cross 100 users.", "Crossing the cap is a typical trigger for CASA."],
    };
  }
  if (!a.readsMail) {
    return {
      verdict: "sensitive-only",
      headline: "Verification yes, CASA probably no: send-only",
      reasons: ["gmail.send is a sensitive scope, not a restricted one. It needs Google's OAuth verification but not the yearly CASA assessment."],
      next: ["Request only gmail.send and nothing broader.", "Prepare the consent screen, privacy policy and a scope justification video."],
    };
  }
  if (!a.usesServer) {
    return {
      verdict: "sensitive-only",
      headline: "CASA applies only if mail data reaches a server",
      reasons: ["The assessment is required for restricted scopes when data is stored or transmitted through your servers. Data that stays on the user's device is treated differently."],
      next: ["Confirm this with Google's restricted scope verification documentation before you rely on it."],
    };
  }
  return {
    verdict: "casa",
    headline: "Likely yes: restricted scopes with a server",
    reasons: [
      "Reading or modifying Gmail through a server uses restricted scopes. Google asks for an annual third-party security assessment (CASA) for your OAuth app.",
      "Self-hosting does not remove this. The assessment is for the OAuth app you register, not for where our code runs.",
    ],
    next: [
      "Budget for the lab: about $499 to $855 for a Tier 2 style scan, and up to about $5,400 for a deeper assessment, per app per year (estimates read Nov 2026, check the lab's current price).",
      "Use the Readiness Kit for the evidence about our part: security questionnaire mapping, scan configuration and report, deletion evidence, architecture and encryption notes.",
      "A different path may avoid it: IMAP with app passwords, send-only, or a Workspace Internal app.",
    ],
  };
}
