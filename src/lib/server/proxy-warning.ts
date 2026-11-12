// One warning for a likely proxy misconfiguration. Better Auth's rate limits
// (sign-in, registration) count per client address, which SvelteKit resolves
// (src/hooks.server.ts). Behind a reverse proxy without ADDRESS_HEADER, that
// address is the proxy's, so every user shares one bucket (3 sign-ins per
// 10 s site-wide). A private or loopback address on /api/auth with
// ADDRESS_HEADER unset is the sign; it is logged once per process, not per
// request. Vercel resolves the address itself and isn't checked.

import { isPrivateAddress } from '@/lib/integrations/url-guard';

let warned = false;

/** Logs the warning the first time `address` looks like a proxy's; returns whether it did. */
export function warnIfBehindUnconfiguredProxy(address: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (warned || env.ADDRESS_HEADER || env.VERCEL) return false;
  if (!isPrivateAddress(address)) return false;
  warned = true;
  console.warn(
    `[auth] Sign-in requests arrive from ${address}, a private or loopback address, and ADDRESS_HEADER is not set. ` +
      'If this server is behind a reverse proxy, every user shares one sign-in and client-registration rate limit: ' +
      'set ADDRESS_HEADER=X-Forwarded-For and XFF_DEPTH=<number of proxies> (docs/SELF_HOSTING.md). ' +
      'If people reach it directly on a private network, ignore this.',
  );
  return true;
}
