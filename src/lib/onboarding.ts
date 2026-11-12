import type { Db } from "@/lib/db/types";
import { countMailboxes } from "@/lib/billing/usage";

/** What a new org has already done on the way to its first webhook. Drives the overview checklist. */
export interface OnboardingFacts { keys: number; endpoints: number; lines: number; deliveries: number }

export const ONBOARDING_STEPS = [
  { id: "key", title: "Create an API key", body: "Server-side key for calls to /v1. It is shown once with a ready-to-run curl command, so copy both.", href: "/app/keys", cta: "Create a key" },
  { id: "webhook", title: "Add a webhook endpoint", body: "Where we send signed events such as messageNew. Send a test to check your signature code.", href: "/app/settings/webhooks", cta: "Add an endpoint" },
  { id: "line", title: "Connect a mailbox", body: "Create a connect link on the Lines screen and open it to connect your own inbox. No code needed for this first one.", href: "/app/lines", cta: "Connect a mailbox" },
  { id: "event", title: "Watch the first event arrive", body: "New mail shows up on the ticker and is delivered to your webhook. Deliveries lists every attempt.", href: "/app/ticker", cta: "Open the ticker" },
] as const;

export type StepId = (typeof ONBOARDING_STEPS)[number]["id"];

export function onboardingSteps(f: OnboardingFacts) {
  const done: Record<StepId, boolean> = { key: f.keys > 0, webhook: f.endpoints > 0, line: f.lines > 0, event: f.deliveries > 0 };
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: done[s.id] }));
  const doneCount = steps.filter((s) => s.done).length;
  /** The first open step is the one to do now (highlighted as the primary button). */
  const next = steps.find((s) => !s.done)?.id ?? null;
  return { steps, doneCount, total: steps.length, next };
}

export async function onboardingFacts(db: Db, orgId: string, keys: number): Promise<OnboardingFacts> {
  const [endpoints, lines, deliveries] = await Promise.all([
    db.listWebhookEndpoints(orgId).then((e) => e.length),
    countMailboxes(db, orgId),
    db.listDeliveries(orgId, { limit: 1 }).then((d) => d.length),
  ]);
  return { keys, endpoints, lines, deliveries };
}
