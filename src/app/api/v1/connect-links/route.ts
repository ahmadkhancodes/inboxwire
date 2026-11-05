import { z } from "zod";
import { authEnv } from "@/lib/connect/env";
import { createConnectLink } from "@/lib/connect/links";
import { appUrl } from "@/lib/env";
import { json, readJson, withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  externalId: z.string().min(1).max(200).optional(),
  redirectUrl: z.string().url().max(2048).optional(),
  email: z.string().email().max(320).optional(),
});

/** `POST /v1/connect-links`: single use, 24 h. The hosted page returns 410 once it is used or expired. */
export const POST = withApi(async (req) => {
  const { keyId, env, db } = await authEnv(req, "admin");
  await enforceRateLimit(`api:${keyId}`, RULES.api, db);
  const body = await readJson(req, Body);
  const { token, expiresAt } = await createConnectLink(db, { envId: env.id, ...body });
  return json({ url: `${appUrl()}/connect/${token}`, token, expiresAt: expiresAt.toISOString(), environment: env.name }, 201);
}, { csrf: false });
