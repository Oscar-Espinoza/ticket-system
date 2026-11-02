// SSRF guard for user-supplied outgoing URLs (webhooks). Server-only.
//
// Production: https only, no embedded credentials, and the host must not be —
// literally or after DNS resolution — loopback, private, link-local, CGNAT or
// otherwise internal. Outside production (local dev / tests) http and private
// hosts are allowed so developers can point a webhook at localhost.
// Deliveries also use `redirect: 'manual'`, so a public host can't bounce the
// request inward.

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

const strict = () => process.env.NODE_ENV === 'production';

export const URL_MAX = 2000;

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

function isPrivateIPv4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast + reserved + broadcast
  );
}

/**
 * Parses an IPv6 literal into its eight 16-bit groups. Accepts `::` compression,
 * an embedded dotted IPv4 tail and a `%zone` suffix. Returns null when invalid.
 */
export function parseIPv6(raw: string): number[] | null {
  const ip = raw.toLowerCase().split('%')[0];
  if (isIP(ip) !== 6) return null;
  let head = ip;
  const tail: number[] = [];
  const v4 = ip.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const o = v4.slice(1, 5).map(Number);
    tail.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
    head = ip.slice(0, ip.length - v4[0].length);
    // "::1.2.3.4" leaves "::", "::ffff:1.2.3.4" leaves "::ffff:", "1:2:3:4:5:6:1.2.3.4" leaves "1:2:3:4:5:6:"
    if (head.endsWith(':') && !head.endsWith('::')) head = head.slice(0, -1);
  }
  const parseGroups = (part: string) =>
    part === '' ? [] : part.split(':').map((g) => parseInt(g, 16));
  let groups: number[];
  const gap = head.indexOf('::');
  if (gap >= 0) {
    const left = parseGroups(head.slice(0, gap));
    const right = parseGroups(head.slice(gap + 2));
    const fill = 8 - tail.length - left.length - right.length;
    if (fill < 0) return null;
    groups = [...left, ...new Array<number>(fill).fill(0), ...right, ...tail];
  } else {
    groups = [...parseGroups(head), ...tail];
  }
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

function ipv4FromGroups(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

function isPrivateIPv6(g: number[]): boolean {
  const zeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  // ::/128 unspecified and ::1 loopback
  if (zeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return true;
  // ::ffff:0:0/96 IPv4-mapped, and ::/96 IPv4-compatible (deprecated): classify the IPv4
  if (zeroPrefix(5) && g[5] === 0xffff) return isPrivateIPv4(ipv4FromGroups(g[6], g[7]));
  if (zeroPrefix(6)) return isPrivateIPv4(ipv4FromGroups(g[6], g[7]));
  // ::ffff:0:a.b.c.d (SIIT, RFC 6052 "IPv4-translated")
  if (zeroPrefix(4) && g[4] === 0xffff && g[5] === 0) return true;
  // 64:ff9b::/96 and 64:ff9b:1::/48 NAT64 can reach IPv4 internals
  if (g[0] === 0x64 && g[1] === 0xff9b) return true;
  // 100::/64 discard-only
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;
  // 2001::/32 Teredo tunnels to arbitrary IPv4; 2001:db8::/32 documentation;
  // 2001:10::/28 ORCHID, 2001:20::/28 ORCHIDv2 — none are legitimate webhook hosts.
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8 || (g[1] & 0xffe0) === 0x0020 || (g[1] & 0xfff0) === 0x0010)) {
    return true;
  }
  // 2002::/16 6to4: the embedded IPv4 decides
  if (g[0] === 0x2002) return isPrivateIPv4(ipv4FromGroups(g[1], g[2]));
  // fc00::/7 unique local, fe80::/10 link-local, fec0::/10 site-local, ff00::/8 multicast
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true;
  if ((g[0] & 0xff00) === 0xff00) return true;
  // Only 2000::/3 is globally routed unicast; anything else is reserved.
  return (g[0] & 0xe000) !== 0x2000;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip.split('%')[0]);
  if (version === 4) return isPrivateIPv4(ip);
  if (version !== 6) return true; // not an IP at all: refuse rather than guess
  const groups = parseIPv6(ip);
  return groups ? isPrivateIPv6(groups) : true;
}

function isInternalHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    !host.includes('.') // single-label names resolve via search domains
  );
}

/** Synchronous shape check for a webhook URL (used when saving). */
export function checkOutgoingUrl(raw: unknown): UrlCheck {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { ok: false, error: 'URL is required.' };
  if (value.length > URL_MAX) return { ok: false, error: 'URL is too long.' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'Enter a valid URL.' };
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !strict())) {
    return { ok: false, error: 'URL must use https.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'URL must not contain credentials.' };
  }
  if (strict()) {
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (isIP(host) ? isPrivateAddress(host) : isInternalHostname(host)) {
      return { ok: false, error: 'URL must point to a public host.' };
    }
  }
  return { ok: true, url: url.toString() };
}

/**
 * Delivery-time check: re-validates and resolves the host so a public name that
 * points at a private address is refused. Returns false instead of throwing.
 */
export async function isDeliverableUrl(raw: string): Promise<boolean> {
  const check = checkOutgoingUrl(raw);
  if (!check.ok) return false;
  if (!strict()) return true;
  const host = new URL(check.url).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/**
 * `lookup` for outgoing sockets: resolves the name and refuses the connection
 * if any address is private. Because the socket connects to the address this
 * function returns, a DNS answer can't change between the check and the
 * connect (DNS rebinding).
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || (strict() && list.some((a) => isPrivateAddress(a.address)))) {
      const refused = Object.assign(new Error(`Refused: ${hostname} resolves to a non-public address.`), {
        code: 'EREFUSED_PRIVATE',
      });
      return callback(refused, '', 0);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

export type GuardedResponse = { status: number; statusText: string };

/**
 * POSTs `body` to a URL that already passed `isDeliverableUrl`, pinning the
 * connection to a guarded DNS answer. Never follows redirects. Throws on
 * network errors and on timeout (error name `TimeoutError`).
 */
export function postGuarded(
  rawUrl: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<GuardedResponse> {
  const url = new URL(rawUrl);
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        lookup: guardedLookup,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume(); // drain and discard: we never read the body
        resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? '' });
      },
    );
    req.on('timeout', () => {
      const err = new Error('Timed out');
      err.name = 'TimeoutError';
      req.destroy(err);
    });
    req.on('error', reject);
    req.end(body);
  });
}
