import { z } from "zod";
import { discover } from "@/lib/connect/discover";
import { assertLink, lookupConnectLink } from "@/lib/connect/links";
import { getDb } from "@/lib/db";
import { clientIp, json, readJson, withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Autodiscovery for the hosted page: provider + IMAP/SMTP hints, and whether the env has the BYO OAuth client. */
export const POST = withApi(async (req, { params }: { params: Promise<{ token: string }> }) => {
  const db = await getDb();
  await enforceRateLimit(`connect:${clientIp(req)}`, RULES.publicForm, db);
  const link = assertLink(await lookupConnectLink(db, (await params).token));
  const { email } = await readJson(req, z.object({ email: z.string().email().max(320) }));
  const d = await discover(email);
  const oauthReady = d.provider === "imap" ? null : !!(await db.getOAuthClient(link.envId, d.provider));
  return json({ ...d, oauthReady });
});
