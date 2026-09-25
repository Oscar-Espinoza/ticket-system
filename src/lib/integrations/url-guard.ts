// SSRF guard for user-supplied outgoing URLs (webhooks). Server-only.
//
// Production: https only, no embedded credentials, and the host must not be —
// literally or after DNS resolution — loopback, private, link-local, CGNAT or
// otherwise internal. Outside production (local dev / tests) http and private
// hosts are allowed so developers can point a webhook at localhost.
// Deliveries also use `redirect: 'manual'`, so a public host can't bounce the
// request inward.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const strict = () => process.env.NODE_ENV === 'production';

export const URL_MAX = 2000;

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version !== 6) return true; // not an IP at all: refuse rather than guess
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') || // unique local
    /^fe[89ab]/.test(v6) || // link-local
    v6.startsWith('ff') || // multicast
    v6.startsWith('64:ff9b:') // NAT64 can reach IPv4 internals
  );
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
