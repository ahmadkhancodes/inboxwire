import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clearPriceCache } from "@/lib/billing/catalog";
import { effectivePlan, NONE } from "@/lib/billing/entitlement";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import type { Db } from "@/lib/db/types";
import { instanceLicence, issueSelfhostLicence, licenceView, publicKey } from "@/lib/licences";
import { check, generateKeys, issue } from "@/lib/mailcore/licence";
import { event, fakeStripe } from "./fakes";
import { newDb } from "./m2-helpers";

const keys = generateKeys();
const DAY = 86400;
const T0 = new Date("2026-11-05T12:00:00Z");
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

describe("licence issue and verify", () => {
  let db: Db;
  beforeEach(() => { db = newDb(); });

  it("issues a key that verifies offline with the public key, bound to org and plan", async () => {
    const r = await issueSelfhostLicence(db, { orgId: "org_1", invoiceId: "in_1", expiresAt: new Date(T0.getTime() + 365 * DAY * 1000), now: T0, privateKeyPem: keys.privateKey });
    expect(r?.created).toBe(true);
    const st = check(keys.publicKey, r!.licence.key, sec(T0) + 3600);
    expect(st.status).toBe("valid");
    expect(st.payload).toMatchObject({ org: "org_1", plan: "selfhost", features: expect.arrayContaining(["unlimited_mailboxes"]) });
  });

  it("is idempotent per invoice: a Stripe retry returns the same key", async () => {
    const i = { orgId: "org_1", invoiceId: "in_1", expiresAt: new Date(T0.getTime() + 30 * DAY * 1000), now: T0, privateKeyPem: keys.privateKey };
    const a = await issueSelfhostLicence(db, i);
    const b = await issueSelfhostLicence(db, { ...i, now: new Date(T0.getTime() + 5000) });
    expect(b?.created).toBe(false);
    expect(b?.licence.key).toBe(a?.licence.key);
    expect(await db.listLicences("org_1")).toHaveLength(1);
    await issueSelfhostLicence(db, { ...i, invoiceId: "in_2" });
    expect(await db.listLicences("org_1")).toHaveLength(2);
  });

  it("issues nothing without a signing key", async () => {
    expect(await issueSelfhostLicence(db, { orgId: "o", invoiceId: "in_x", expiresAt: T0, privateKeyPem: null })).toBeNull();
  });

  it("a tampered key is rejected; wrong public key is rejected", async () => {
    const key = (await issueSelfhostLicence(db, { orgId: "org_1", invoiceId: "in_1", expiresAt: new Date(T0.getTime() + 30 * DAY * 1000), now: T0, privateKeyPem: keys.privateKey }))!.licence.key;
    const [v, body, sig] = key.split(".");
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString());
    forged.expiresAt += 10 * 365 * DAY;
    const tampered = `${v}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    expect(check(keys.publicKey, tampered, sec(T0))).toMatchObject({ status: "invalid", reason: "bad signature" });
    expect(check(generateKeys().publicKey, key, sec(T0)).status).toBe("invalid");
    expect(check(keys.publicKey, "garbage", sec(T0)).status).toBe("invalid");
  });

  it("expiry then 30 day grace then expired; +/-24 h skew tolerated", () => {
    const exp = sec(T0) + 10 * DAY;
    const key = issue(keys.privateKey, { id: "l", org: "o", plan: "selfhost", issuedAt: sec(T0), expiresAt: exp });
    expect(check(keys.publicKey, key, exp - 1).status).toBe("valid");
    expect(check(keys.publicKey, key, exp + DAY - 1).status).toBe("valid");
    expect(check(keys.publicKey, key, exp + 2 * DAY).status).toBe("grace");
    expect(check(keys.publicKey, key, exp + 30 * DAY).status).toBe("grace");
    expect(check(keys.publicKey, key, exp + 30 * DAY + 1).status).toBe("expired");
  });

  it("licenceView reports status, grace end and revocation for Billing", async () => {
    const r = (await issueSelfhostLicence(db, { orgId: "org_1", invoiceId: "in_1", expiresAt: new Date(T0.getTime() + 10 * DAY * 1000), now: T0, privateKeyPem: keys.privateKey }))!.licence;
    expect(licenceView(r, keys.publicKey, T0)).toMatchObject({ status: "valid" });
    const late = new Date(T0.getTime() + 20 * DAY * 1000);
    const v = licenceView(r, keys.publicKey, late);
    expect(v.status).toBe("grace");
    expect(v.graceEndsAt).toBe(new Date(r.expiresAt.getTime() + 30 * DAY * 1000).toISOString());
    expect(licenceView({ ...r, revokedAt: late }, keys.publicKey, T0)).toMatchObject({ status: "invalid", reason: "revoked" });
    expect(licenceView(r, null, T0).status).toBe("invalid");
  });

  it("publicKey derives from the signing key; \\n escapes work", () => {
    const escaped = keys.privateKey.replace(/\n/g, "\\n");
    expect(publicKey({ LICENCE_SIGNING_KEY: escaped })?.trim()).toBe(keys.publicKey.trim());
    expect(publicKey({})).toBeNull();
  });
});

describe("invoice.paid issues a licence for self-host", () => {
  const NOW = 1_800_000_000_000;
  let db: Db;
  let f: ReturnType<typeof fakeStripe>;
  beforeEach(async () => {
    db = newDb(); f = fakeStripe(); clearPriceCache();
    await db.upsertBillingAccount({ id: "org_1", stripeCustomerId: (await f.stripe.customers.create({ metadata: {} })).id, email: "a@b.test" });
  });
  const hook = (body: string) => handleStripeWebhook(body, "good", {
    stripe: f.stripe, db, secret: "x", now: () => NOW,
    onInvoicePaid: async ({ orgId, invoiceId, entitlement }) => {
      if (entitlement.plan === "selfhost" && entitlement.isPaid) await issueSelfhostLicence(db, { orgId, invoiceId, expiresAt: new Date(entitlement.expiresAt!), privateKeyPem: keys.privateKey });
    },
  });

  it("issues once for a self-host invoice, never for Cloud plans", async () => {
    const acct = await db.getBillingAccount("org_1");
    f.addSub(acct!.stripeCustomerId!, "inboxwire_selfhost_annual");
    await hook(event("invoice.paid", { id: "in_77", customer: acct!.stripeCustomerId }, "evt_a"));
    await hook(event("invoice.paid", { id: "in_77", customer: acct!.stripeCustomerId }, "evt_b"));
    const ls = await db.listLicences("org_1");
    expect(ls).toHaveLength(1);
    expect(ls[0]!.invoiceId).toBe("in_77");
    expect(check(keys.publicKey, ls[0]!.key, Math.floor(NOW / 1000)).status).toBe("valid");
    const other = newDb();
    await other.upsertBillingAccount({ id: "org_2", stripeCustomerId: "cus_9", email: null });
    expect(await other.listLicences("org_2")).toHaveLength(0);
  });
});

describe("instance licence drives the plan (self-host)", () => {
  it("valid or grace = selfhost plan; expired or missing = free; none set = no effect", () => {
    const now = Date.now();
    const exp = Math.floor(now / 1000) + 10 * DAY;
    const key = issue(keys.privateKey, { id: "l", org: "o", plan: "selfhost", issuedAt: Math.floor(now / 1000) - DAY, expiresAt: exp });
    const env = { INBOXWIRE_LICENCE: key, LICENCE_PUBLIC_KEY: keys.publicKey };
    expect(instanceLicence(now, env)?.status).toBe("valid");
    expect(instanceLicence(now + 20 * DAY * 1000, env)?.status).toBe("grace");
    expect(instanceLicence(now + 60 * DAY * 1000, env)?.status).toBe("expired");
    expect(instanceLicence(now, {})).toBeNull();
    expect(instanceLicence(now, { INBOXWIRE_LICENCE: key })?.status).toBe("invalid");
    process.env.INBOXWIRE_LICENCE = key;
    process.env.LICENCE_PUBLIC_KEY = keys.publicKey;
    try {
      expect(effectivePlan(NONE(now), now).id).toBe("selfhost");
      expect(effectivePlan(NONE(now), now + 90 * DAY * 1000).id).toBe("free");
    } finally {
      delete process.env.INBOXWIRE_LICENCE;
      delete process.env.LICENCE_PUBLIC_KEY;
    }
    expect(effectivePlan(NONE(now), now).id).toBe("free");
  });
});

describe("scripts/verify-licence.mjs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ibw-lic-"));
  const pubFile = path.join(dir, "pub.pem");
  writeFileSync(pubFile, keys.publicKey);
  const script = path.resolve("scripts/verify-licence.mjs");
  const now = Math.floor(Date.now() / 1000);
  const key = (exp: number) => issue(keys.privateKey, { id: "l", org: "org_1", plan: "selfhost", issuedAt: now - 100 * DAY, expiresAt: exp });
  const run = (args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, INBOXWIRE_LICENCE: "", LICENCE_PUBLIC_KEY: "" } as NodeJS.ProcessEnv });

  it("exit 0 valid, 2 grace, 1 expired, 1 tampered, 1 malformed", () => {
    expect(run([key(now + 10 * DAY), "--public-key", pubFile]).status).toBe(0);
    const grace = run([key(now - 10 * DAY), "--public-key", pubFile, "--json"]);
    expect(grace.status).toBe(2);
    expect(JSON.parse(grace.stdout)).toMatchObject({ status: "grace", payload: { org: "org_1" } });
    expect(run([key(now - 40 * DAY), "--public-key", pubFile]).status).toBe(1);
    const [v, b, s] = key(now + 10 * DAY).split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b!, "base64url").toString()), expiresAt: now + 99 * DAY })).toString("base64url");
    expect(run([`${v}.${forged}.${s}`, "--public-key", pubFile]).stdout).toMatch(/bad signature/);
    expect(run(["nope", "--public-key", pubFile]).status).toBe(1);
  });

  it("reads the key from --file and INBOXWIRE_LICENCE, and fails clearly without a public key", () => {
    const f = path.join(dir, "k.txt");
    writeFileSync(f, key(now + DAY) + "\n");
    expect(run(["--file", f, "--public-key", pubFile]).status).toBe(0);
    const viaEnv = spawnSync(process.execPath, [script, "--public-key", pubFile], { encoding: "utf8", env: { ...process.env, LICENCE_PUBLIC_KEY: "", INBOXWIRE_LICENCE: key(now + DAY) } as NodeJS.ProcessEnv });
    expect(viaEnv.status).toBe(0);
    expect(run([key(now + DAY), "--public-key", path.join(dir, "missing.pem")]).stdout).toMatch(/public key not found/);
  });

  it("agrees with the in-app check on the same key (time travel with --now)", () => {
    const k = key(now + 5 * DAY);
    for (const t of [now, now + 6 * DAY, now + 40 * DAY]) {
      const cli = run([k, "--public-key", pubFile, "--json", "--now", String(t)]);
      expect(JSON.parse(cli.stdout).status).toBe(check(keys.publicKey, k, t).status);
    }
  });
});
