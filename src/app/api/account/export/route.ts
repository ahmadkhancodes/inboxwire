import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/account/export: JSON of the user's data and every org they belong to (new; neither app had it). */
export const GET = withApi(async () => {
  const { user } = await requireUser();
  const db = await getDb();
  await enforceRateLimit(`export:${user.id}`, RULES.account, db);
  const auth = await getAuth();
  const h = await headers();
  const orgs = (await auth.api.listOrganizations({ headers: h })) as { id: string; name: string; slug: string; createdAt?: Date }[];
  // Each org's data only as far as the member's role may read it in the dashboard (a viewer never got the audit log there).
  const roleIn = async (organizationId: string) => {
    const m = (await auth.api.getActiveMemberRole({ headers: h, query: { organizationId } }).catch(() => null)) as { role?: string } | null;
    return m?.role?.split(",")[0] ?? null;
  };
  const sessions = await auth.api.listSessions({ headers: h }).catch(() => []);
  const data = {
    exportedAt: new Date().toISOString(),
    user,
    sessions: (sessions as { id: string; createdAt: Date; userAgent?: string | null; ipAddress?: string | null }[]).map((s) => ({ id: s.id, createdAt: s.createdAt, userAgent: s.userAgent, ipAddress: s.ipAddress })),
    organizations: await Promise.all(orgs.map(async (o) => ({ ...o, data: orgDataFor(await roleIn(o.id), await db.exportOrgData(o.id)) }))),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${db.app}-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

/** Drops the sections the role cannot read: billing (billing:read), webhook endpoints (webhook:read), audit log (audit:read). */
function orgDataFor(role: string | null, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const need = k === "auditLog" ? can(role, "audit", "read") : k === "webhookEndpoints" ? can(role, "webhook", "read") : k === "billingAccount" || k === "entitlement" ? can(role, "billing", "read") : can(role, "audit", "read");
    if (need) out[k] = v;
  }
  return out;
}
