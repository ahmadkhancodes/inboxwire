"use client";
import { useState } from "react";
import { assessCasa, CASA_DEFAULTS, type CasaAnswers } from "@/lib/casa";
import { Notice } from "@/components/ui/states";

type Key = keyof CasaAnswers;
const QUESTIONS: { key: Key; label: string; hint: string }[] = [
  { key: "gmail", label: "Your app connects to Gmail or Google Workspace mailboxes", hint: "Untick for Microsoft 365 or plain IMAP only." },
  { key: "readsMail", label: "It reads, searches or modifies mail", hint: "Ticked means restricted scopes such as gmail.readonly or gmail.modify. Untick if it only sends." },
  { key: "usesServer", label: "Mail data is stored or passes through a server", hint: "Inboxwire Cloud or your own self-hosted server both count." },
  { key: "workspaceInternal", label: "Only people in your own Workspace organisation connect", hint: "Your OAuth app is set to Internal." },
  { key: "testingUnder100", label: "Fewer than 100 users, and the app stays in Testing", hint: "Test users are listed by hand in the Google console." },
];

const tone = { casa: "warning", "sensitive-only": "info", none: "success" } as const;

export function CasaCalculator() {
  const [answers, setAnswers] = useState<CasaAnswers>(CASA_DEFAULTS);
  const result = assessCasa(answers);
  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-16">
      <form className="flex flex-col lg:col-span-6" onSubmit={(e) => e.preventDefault()} aria-label="Check which CASA path applies to you">
        <fieldset className="flex flex-col">
          <legend className="heading-6 mb-4 text-text">Which of these are true?</legend>
          {QUESTIONS.map((q) => (
            <label key={q.key} className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-border py-4 last:border-b">
              <input
                type="checkbox"
                checked={answers[q.key]}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.checked }))}
                className="mt-1 size-5 shrink-0 accent-action focus-visible:focus-ring"
              />
              <span className="flex flex-col gap-1">
                <span className="title-3 text-text">{q.label}</span>
                <span className="caption-2 text-text-subtle">{q.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </form>
      <div className="lg:col-span-6" aria-live="polite">
        <Notice tone={tone[result.verdict]} title={result.headline}>
          <ul className="mt-2 flex flex-col gap-2">
            {result.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Notice>
        <h3 className="heading-6 mt-8 text-text">What to do next</h3>
        <ul className="body-3 mt-4 flex list-disc flex-col gap-3 pl-5 text-text-subtle">
          {result.next.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <p className="caption-2 mt-6 text-text-subtle">A rough guide, calculated in your browser. Nothing is sent anywhere. Google decides, so check its current policy.</p>
      </div>
    </div>
  );
}
