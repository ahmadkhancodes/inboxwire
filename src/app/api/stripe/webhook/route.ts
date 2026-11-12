import { emitEvent } from "@/lib/webhooks/outbound";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { getStripe } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";
import { issueSelfhostLicence } from "@/lib/licences";
import { env } from "@/lib/env";
import { json, readBodyText } from "@/lib/http";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhook: signature on the RAW body (readBodyText, never req.json()). Exempt from CSRF (signed). */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return json({ error: "billing_unavailable" }, 503);
  const raw = await readBodyText(req).catch(() => null); // raw bytes, capped at 1 MB
  if (raw === null) return json({ error: "body_too_large" }, 413);
  try {
    const db = await getDb();
    return await handleStripeWebhook(raw, req.headers.get("stripe-signature"), {
      stripe,
      db,
      secret,
      onInvoicePaid: async ({ orgId, invoiceId, entitlement }) => {
        if (entitlement.plan !== "selfhost" || !entitlement.isPaid) return;
        // Licence runs to the end of the paid period (a month or a year); the verifier adds the 30 day grace.
        const expiresAt = new Date(entitlement.expiresAt ?? Date.now() + 31 * 86_400_000);
        const r = await issueSelfhostLicence(db, { orgId, invoiceId, expiresAt });
        if (!r) log.warn("licence_not_issued", { code: "no_signing_key" });
      },
      onChange: async (orgId, type) => {
        const ent = await db.getEntitlement(orgId);
        await emitEvent(orgId, "billing.updated", { stripeEvent: type, plan: ent?.plan, status: ent?.status }, { db }).catch(() => []);
      },
    });
  } catch (e) {
    // 500 => Stripe retries; the event was NOT recorded, so the retry reprocesses it.
    log.error("stripe_webhook_failed", { message: (e as Error).message });
    return json({ error: "server_error" }, 500);
  }
}
