import { z } from "zod";
import { completeImap } from "@/lib/connect/complete";
import { assertLink, lookupConnectLink } from "@/lib/connect/links";
import { getDb } from "@/lib/db";
import { clientIp, json, readJson, withApi } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Server = z.object({ host: z.string().min(1).max(253), port: z.number().int().min(1).max(65535), secure: z.boolean() });
const Body = z.object({ email: z.string().email().max(320), username: z.string().max(320).optional(), password: z.string().min(1).max(1000), imap: Server, smtp: Server.optional() });

/** Verifies IMAP login (422 on failure), then stores encrypted settings and consumes the link. */
export const POST = withApi(async (req, { params }: { params: Promise<{ token: string }> }) => {
  const db = await getDb();
  await enforceRateLimit(`connect-imap:${clientIp(req)}`, { limit: 10, windowMs: 10 * 60_000 }, db);
  const link = assertLink(await lookupConnectLink(db, (await params).token));
  const b = await readJson(req, Body);
  const r = await completeImap(db, link, { email: b.email, imap: { ...b.imap, user: b.username || b.email, pass: b.password }, smtp: b.smtp });
  return json(r, 201);
});
