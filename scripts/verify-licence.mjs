#!/usr/bin/env node
// Offline verification of an Inboxwire self-host licence key (Ed25519). No network, no dependencies.
//
//   node scripts/verify-licence.mjs [KEY | --file path] [--public-key path] [--now <unix seconds>] [--json]
//
// KEY defaults to $INBOXWIRE_LICENCE. The public key comes from --public-key, $LICENCE_PUBLIC_KEY (PEM) or /app/licence-public.pem.
// Exit codes: 0 valid, 2 expired but inside the 30 day grace period, 1 expired / invalid / unreadable.
// The rules mirror src/lib/mailcore/licence.ts (tests/unit/licence.test.ts runs both against the same keys).
import { createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const DAY = 86400, SKEW = DAY, GRACE = 30 * DAY;

export function check(publicKeyPem, key, now = Math.floor(Date.now() / 1000)) {
  const [v, body, sig] = String(key).trim().split(".");
  if (v !== "IBW1" || !body || !sig) return { status: "invalid", reason: "malformed" };
  let ok = false;
  try { ok = verify(null, Buffer.from(body), createPublicKey(publicKeyPem), Buffer.from(sig, "base64url")); } catch { /* falls through */ }
  if (!ok) return { status: "invalid", reason: "bad signature" };
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return { status: "invalid", reason: "malformed" }; }
  if (now + SKEW < payload.issuedAt) return { status: "invalid", payload, reason: "issued in the future" };
  if (now <= payload.expiresAt + SKEW) return { status: "valid", payload };
  if (now <= payload.expiresAt + GRACE) return { status: "grace", payload, reason: "expired, inside the 30 day grace period" };
  return { status: "expired", payload, reason: "expired" };
}

function arg(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; }

function main() {
  const json = process.argv.includes("--json");
  const out = (res, code) => {
    const exp = res.payload ? new Date(res.payload.expiresAt * 1000).toISOString().slice(0, 10) : null;
    if (json) console.log(JSON.stringify({ ...res, expires: exp }));
    else console.log(`licence ${res.status}${res.reason ? ` (${res.reason})` : ""}${res.payload ? `: plan ${res.payload.plan}, expires ${exp}, org ${res.payload.org}` : ""}`);
    process.exit(code);
  };
  const file = arg("--file");
  const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !["--file", "--public-key", "--now"].includes(all[i - 1] ?? ""));
  let key = positional[0] ?? (file ? readFileSync(file, "utf8") : process.env.INBOXWIRE_LICENCE);
  if (!key) return out({ status: "invalid", reason: "no licence key given (argument, --file or INBOXWIRE_LICENCE)" }, 1);
  const pubFile = arg("--public-key") ?? (process.env.LICENCE_PUBLIC_KEY ? null : "/app/licence-public.pem");
  let pub = process.env.LICENCE_PUBLIC_KEY?.replace(/\\n/g, "\n");
  if (pubFile) { if (!existsSync(pubFile)) return out({ status: "invalid", reason: `public key not found: ${pubFile}` }, 1); pub = readFileSync(pubFile, "utf8"); }
  const now = arg("--now") ? Number(arg("--now")) : undefined;
  const res = check(pub, key, now);
  out(res, res.status === "valid" ? 0 : res.status === "grace" ? 2 : 1);
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
