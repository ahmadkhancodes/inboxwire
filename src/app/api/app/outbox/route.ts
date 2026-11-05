import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";
import { outboxView } from "@/lib/v1/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent sends of the organisation (all environments), newest first. No payloads. */
export const GET = withApi(async () => {
  const ctx = await requireOrg();
  requirePermission(ctx, "apiKey", "read");
  const db = await getDb();
  const envs = await db.listEnvironments(ctx.org.id);
  const names = new Map(envs.map((e) => [e.id, e.name]));
  const items = await db.listOutbox(envs.map((e) => e.id), 100);
  return json({ items: items.map((o) => ({ ...outboxView(o), env: names.get(o.envId) ?? null })) });
});
