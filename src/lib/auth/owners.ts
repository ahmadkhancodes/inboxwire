/** Emails of an organization's owners (Better Auth `member` + `user` collections). Used for operational notices such as a disabled webhook. */
export async function orgOwnerEmails(orgId: string): Promise<string[]> {
  const isOwner = (role: unknown) => String(role ?? "").split(",").includes("owner");
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const { mongoClient } = await import("@/lib/db/mongo");
    const d = (await mongoClient(uri)).db(process.env.MONGODB_DB ?? process.env.APP_NAME ?? "inboxwire");
    const members = await d.collection("member").find({ organizationId: orgId }).toArray();
    const ids = members.filter((m) => isOwner(m.role)).map((m) => m.userId);
    if (!ids.length) return [];
    const users = await d.collection("user").find({ $or: [{ id: { $in: ids } }, { _id: { $in: ids as never[] } }] }).toArray();
    return users.map((u) => String(u.email)).filter(Boolean);
  }
  const mem = globalThis.__kitAuthMemory as Record<string, { id?: string; organizationId?: string; userId?: string; role?: string; email?: string }[]> | undefined;
  const ids = new Set((mem?.member ?? []).filter((m) => m.organizationId === orgId && isOwner(m.role)).map((m) => m.userId));
  return (mem?.user ?? []).filter((u) => u.id && ids.has(u.id) && u.email).map((u) => u.email!);
}
