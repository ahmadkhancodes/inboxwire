import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { environmentWithinPlan } from "@/lib/connect/env";
import { validateClientCredentials } from "@/lib/connect/oauth";
import { validatePubsub, wizardInfo } from "@/lib/connect/wizard";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import { sealForOrg } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EnvName = z.enum(["development", "staging", "production"]);
const Put = z.object({
  environment: EnvName.optional(),
  provider: z.enum(["google", "microsoft"]),
  clientId: z.string().min(8).max(200),
  clientSecret: z.string().min(1).max(500),
  pubsubTopic: z.string().max(300).optional(),
  pubsubServiceAccount: z.string().max(300).optional(),
});

/** OAuth clients are per environment; `?environment=` picks it (default production). */
const envFrom = (req: Request) => {
  const v = new URL(req.url).searchParams.get("environment") ?? "production";
  const p = EnvName.safeParse(v);
  if (!p.success) throw new HttpError(400, "invalid_environment");
  return p.data;
};

export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "apiKey", "read");
  const db = await getDb();
  const env = await environmentWithinPlan(db, ctx.org.id, envFrom(req));
  const clients = (await db.listOAuthClients(env.id)).map(({ clientSecretEnc: _s, ...c }) => ({ ...c, hasSecret: true }));
  return json({ environmentId: env.id, clients, info: wizardInfo(appUrl(), env.id) });
});

export const PUT = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "apiKey", "manage");
  const b = await readJson(req, Put);
  const bad = validateClientCredentials(b.provider, b.clientId.trim(), b.clientSecret.trim()) ?? (b.provider === "google" ? validatePubsub(b.pubsubTopic || null, b.pubsubServiceAccount || null) : null);
  if (bad) throw new HttpError(400, "invalid_input", [{ path: "clientId", message: bad }]);
  const db = await getDb();
  const env = await environmentWithinPlan(db, ctx.org.id, b.environment ?? "production");
  const c = await db.upsertOAuthClient({
    id: uuidv7(), envId: env.id, provider: b.provider, clientId: b.clientId.trim(), mode: "byo",
    clientSecretEnc: await sealForOrg(db, ctx.org.id, b.clientSecret.trim()),
    pubsubTopic: b.provider === "google" ? b.pubsubTopic || null : null, pubsubServiceAccount: b.provider === "google" ? b.pubsubServiceAccount || null : null, watchState: null,
  });
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "oauth_client.saved", target: `${b.provider}:${b.environment ?? "production"}` });
  const { clientSecretEnc: _s, ...safe } = c;
  return json({ client: { ...safe, hasSecret: true } });
});

export const DELETE = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "apiKey", "manage");
  const provider = new URL(req.url).searchParams.get("provider");
  if (provider !== "google" && provider !== "microsoft") throw new HttpError(400, "invalid_input");
  const db = await getDb();
  const env = await environmentWithinPlan(db, ctx.org.id, envFrom(req));
  await db.deleteOAuthClient(env.id, provider);
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "oauth_client.deleted", target: provider });
  return json({ ok: true });
});
