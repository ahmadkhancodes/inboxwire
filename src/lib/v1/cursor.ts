import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/http";
import { masterKey } from "@/lib/secrets";

// Provider cursors are opaque to clients. Graph's is a full URL we would call with the mailbox token, so a client-supplied
// cursor must never be trusted: ours are HMAC-signed and bound to the account, folder and query they were issued for.

const mac = (payload: string) => createHmac("sha256", masterKey()).update("cursor|").update(payload).digest("base64url");

export function sealCursor(scope: { accountId: string; folder?: string; q?: string }, raw: string): string {
  const payload = Buffer.from(JSON.stringify({ a: scope.accountId, f: scope.folder ?? "", q: scope.q ?? "", r: raw })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function openCursor(scope: { accountId: string; folder?: string; q?: string }, cursor: string): string {
  const [payload, sig] = cursor.split(".");
  const bad = () => new HttpError(400, "invalid_cursor");
  if (!payload || !sig) throw bad();
  const expected = Buffer.from(mac(payload));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw bad();
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as { a: string; f: string; q: string; r: string };
    if (c.a !== scope.accountId || c.f !== (scope.folder ?? "") || c.q !== (scope.q ?? "")) throw bad();
    return c.r;
  } catch (e) {
    throw e instanceof HttpError ? e : bad();
  }
}
