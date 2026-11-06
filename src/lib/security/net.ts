import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Outbound-target guard (SSRF). Customer-supplied hosts (IMAP/SMTP servers typed on the hosted connect page, webhook
// URLs) must not reach loopback, private, link-local (cloud metadata), CGNAT or single-label (docker/k8s service) names.
// Self-hosters whose mail server or webhook receiver lives on their own network set ALLOW_PRIVATE_NETWORK_TARGETS=1.

export type Lookup = (host: string) => Promise<string[]>;

export const dnsLookup: Lookup = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

export const allowPrivateTargets = (source: Record<string, string | undefined> = process.env) => source.ALLOW_PRIVATE_NETWORK_TARGETS === "1";

function v4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224 // this-network, private, loopback, multicast + reserved
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || (a === 169 && b === 254) // link-local, cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && p[2] === 0) // IETF protocol assignments
    || (a === 198 && (b === 18 || b === 19)); // benchmarking
}

/** True for any address that is not a public unicast address (unparseable counts as private). */
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase().split("%")[0]!;
  const kind = isIP(ip);
  if (kind === 4) return v4Private(ip);
  if (kind !== 6) return true;
  const mapped = /^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return v4Private(mapped[1]!);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1]!, 16), lo = parseInt(hexMapped[2]!, 16);
    return v4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (ip === "::" || ip === "::1") return true;
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 // unique local fc00::/7
    || (first & 0xffc0) === 0xfe80 // link-local fe80::/10
    || (first & 0xff00) === 0xff00; // multicast
}

/** Names that never resolve on the public internet (RFC 2606 / 6761): safe to skip the DNS step. */
const RESERVED_TLD = /\.(test|example|invalid)$/;

/** Hostname-only verdict, no DNS: false for loopback names, internal suffixes, single labels and private IP literals. */
export function isPublicHostname(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  if (isIP(h)) return !isPrivateAddress(h);
  if (h === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(h)) return false;
  return h.includes(".");
}

/**
 * Throws `private_address` unless `host` is public: the name check above, then every DNS answer must be public.
 * A name that does not resolve passes (the connection itself will fail, nothing internal is reached).
 */
export async function assertPublicHost(host: string, opts: { lookup?: Lookup; source?: Record<string, string | undefined> } = {}): Promise<void> {
  if (allowPrivateTargets(opts.source)) return;
  if (!isPublicHostname(host)) throw new Error("private_address");
  const h = host.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (isIP(h) || RESERVED_TLD.test(h)) return;
  let addrs: string[] = [];
  try {
    addrs = await Promise.race([
      (opts.lookup ?? dnsLookup)(h),
      new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error("dns_timeout")), 3000).unref?.()),
    ]);
  } catch {
    return;
  }
  if (addrs.some(isPrivateAddress)) throw new Error("private_address");
}
