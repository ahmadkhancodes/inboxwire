import { deleteAccount } from "@/lib/accounts/deletion";
import { audit } from "@/lib/audit";
import { billExtraMailboxes } from "@/lib/connect/complete";
import { json } from "@/lib/http";
import { accountView } from "@/lib/v1/schemas";
import { loadAccount, v1 } from "@/lib/v1/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export const GET = v1<Ctx>("read", async ({ db, env }, _req, { params }) => json(accountView(await loadAccount(db, env, (await params).id))));

/** `DELETE /v1/accounts/{id}`: revokes the token, deletes the account's rows and writes a `deletion_record`. */
export const DELETE = v1<Ctx>("admin", async ({ db, env, orgId, keyId }, _req, { params }) => {
  const account = await loadAccount(db, env, (await params).id);
  const rec = await deleteAccount(db, account, "api");
  await audit({ orgId, actorId: `key:${keyId}`, action: "account.deleted.api", target: account.id });
  await billExtraMailboxes(db, orgId);
  return json({ deleted: true, deletionRecordId: rec.id, revocation: rec.revocation, rows: rec.deleted });
});
