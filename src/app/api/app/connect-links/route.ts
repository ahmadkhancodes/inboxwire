import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { mailboxUsage } from "@/lib/billing/mailboxes";
import { environmentWithinPlan } from "@/lib/connect/env";
import { createConnectLink } from "@/lib/connect/links";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { json, readJson, withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  environment: z.enum(["production", "staging", "development"]).default("production"),
  externalId: z.string().trim().min(1).max(200).optional(),
});

/**
 * Dashboard twin of `POST /v1/connect-links` (session instead of an admin API key), so a new user can connect their own
 * mailbox in two clicks and see the first line light up before writing any code. Same single-use, 24 h link.
 */
export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const body = await readJson(req, Body);
  const db = await getDb();
  await enforceRateLimit(`connect-link:${ctx.user.id}`, RULES.api, db);
  const env = await environmentWithinPlan(db, ctx.org.id, body.environment);
  const usage = await mailboxUsage(db, ctx.org.id);
  const { token, expiresAt } = await createConnectLink(db, { envId: env.id, externalId: body.externalId ?? `dashboard:${ctx.user.id}` });
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "connect_link.created", target: env.name });
  return json({
    url: `${appUrl()}/connect/${token}`,
    expiresAt: expiresAt.toISOString(),
    environment: env.name,
    mailboxes: { used: usage.used, included: usage.included, canAdd: usage.canAdd, plan: usage.plan.name },
  }, 201);
});
