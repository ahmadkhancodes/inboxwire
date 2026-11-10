import { orgOwnerEmails } from "@/lib/auth/owners";
import type { WebhookEndpoint } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { sendMailSafe, type MailTransport } from "@/lib/mail";
import { noticeEmail } from "@/lib/mail/templates";

/** Emails the org owners (through the Mailer) that an endpoint was switched off after 72 h of failures. Never includes the signing secret. */
export async function notifyEndpointDisabled(orgId: string, ep: WebhookEndpoint, reason: string, deps: { owners?: (orgId: string) => Promise<string[]>; transport?: MailTransport } = {}) {
  const owners = await (deps.owners ?? orgOwnerEmails)(orgId);
  const host = (() => { try { return new URL(ep.url).host; } catch { return "your endpoint"; } })();
  const m = noticeEmail({
    title: `Webhook endpoint disabled: ${host}`,
    body: `We stopped sending events to ${ep.url} after ${reason}. Fix the endpoint, turn it back on in the dashboard, then replay the failed deliveries from the delivery log. Nothing was lost: failed events stay in the log until it expires.`,
    actionUrl: `${appUrl()}/app/settings/webhooks`, actionLabel: "Open webhooks",
  });
  // One owner's bounce must not stop the others from being told.
  let sent = 0;
  for (const to of owners) if ((await sendMailSafe({ to, ...m, category: "transactional" }, deps.transport)).ok) sent++;
  return sent;
}
