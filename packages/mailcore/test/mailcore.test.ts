import { describe, it, expect } from 'vitest';
import { parseQuery, toGmail, toImap, toGraph } from '../src/search';
import { sign, verify, nextRetryDelaySec } from '../src/webhook';
import { generateKeys, issue, check } from '../src/licence';
import { EnvKeyWrapper, newDataKey, encrypt, decrypt } from '../src/crypto';
import { classify } from '../src/autodiscover';
import { randomBytes } from 'node:crypto';

describe('search', () => {
  const q = parseQuery('from:ana@x.com subject:"Q3 invoice" after:2026-10-01 has:attachment');
  it('parses', () => { expect(q.from).toEqual(['ana@x.com']); expect(q.subject).toEqual(['Q3 invoice']); expect(q.hasAttachment).toBe(true); });
  it('gmail', () => expect(toGmail(q)).toBe('from:ana@x.com subject:"Q3 invoice" after:2026/10/01 has:attachment'));
  it('imap', () => expect(toImap(q)).toMatchObject({ from: 'ana@x.com', subject: 'Q3 invoice', since: '2026-10-01' }));
  it('graph filter', () => expect(toGraph(q).$filter).toContain("from/emailAddress/address eq 'ana@x.com'"));
  it('graph search for free text', () => expect(toGraph(parseQuery('refund from:a@b.co')).$search).toContain('refund'));
  it('rejects bad date', () => expect(() => parseQuery('after:yesterday')).toThrow());
  it('escapes odata quotes', () => expect(toGraph(parseQuery("subject:o'neil")).$filter).toContain("o''neil"));
});
describe('webhook', () => {
  it('round trips', () => { const h = sign('s', '{"a":1}', 1000); expect(verify('s', '{"a":1}', h, 300, 1100)).toBe(true); });
  it('rejects tamper, wrong secret, stale', () => {
    const h = sign('s', 'body', 1000);
    expect(verify('s', 'body2', h, 300, 1000)).toBe(false);
    expect(verify('x', 'body', h, 300, 1000)).toBe(false);
    expect(verify('s', 'body', h, 300, 2000)).toBe(false);
  });
  it('backoff covers 24h then stops', () => {
    let total = 0, a = 0, d: number | null; while ((d = nextRetryDelaySec(a++)) !== null) total += d;
    expect(total).toBeGreaterThanOrEqual(24 * 3600);
  });
});
describe('licence', () => {
  const { publicKey, privateKey } = generateKeys();
  const day = 86400, now = 10_000_000;
  const key = issue(privateKey, { id: 'l1', org: 'o1', plan: 'selfhost', issuedAt: now - day, expiresAt: now + day });
  it('valid', () => expect(check(publicKey, key, now).status).toBe('valid'));
  it('grace then expired', () => { expect(check(publicKey, key, now + 10 * day).status).toBe('grace'); expect(check(publicKey, key, now + 40 * day).status).toBe('expired'); });
  it('tolerates 24h skew', () => expect(check(publicKey, key, now + 2 * day - 1).status).toBe('valid'));
  it('rejects tampered', () => { const [v, b, s] = key.split('.'); const forged = Buffer.from(JSON.stringify({ id: 'l1', org: 'o1', plan: 'enterprise', issuedAt: 0, expiresAt: 9e9 })).toString('base64url'); expect(check(publicKey, `${v}.${forged}.${s}`, now).status).toBe('invalid'); expect(b).toBeTruthy(); });
  it('rejects other signer', () => expect(check(generateKeys().publicKey, key, now).status).toBe('invalid'));
});
describe('crypto', () => {
  it('envelope round trip and tamper detection', () => {
    const w = new EnvKeyWrapper(randomBytes(32)); const { dek, wrapped } = newDataKey(w);
    const ct = encrypt(dek, 'refresh-token'); expect(decrypt(w.unwrap(wrapped), ct)).toBe('refresh-token');
    const bad = Buffer.from(ct, 'base64'); bad[bad.length - 1]! ^= 1; expect(() => decrypt(dek, bad.toString('base64'))).toThrow();
  });
});
describe('autodiscover', () => {
  it('routes providers', () => {
    expect(classify('a@gmail.com').provider).toBe('google'); expect(classify('a@outlook.com').provider).toBe('microsoft');
    expect(classify('a@corp.io', ['aspmx.l.google.com']).provider).toBe('google');
    expect(classify('a@corp.io', ['corp-io.mail.protection.outlook.com']).provider).toBe('microsoft');
    expect(classify('a@small.co').provider).toBe('imap');
  });
});
