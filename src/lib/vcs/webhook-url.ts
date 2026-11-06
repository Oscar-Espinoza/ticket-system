// Where code hosts deliver webhooks and whether they can reach that address.
// Pure URL rules, shared by GitHub (github/webhooks.ts) and the token-based hosts
// (vcs/hosts.ts); imports no host API client. Server-only.

import { appUrl } from '@/lib/integrations/app-url';
import { VCS_PROVIDER_LABEL, VCS_REQUEST_NOUN, type VcsProvider } from '@/lib/vcs/providers';

/**
 * Origin hosts deliver webhooks to. GITHUB_WEBHOOK_BASE_URL points every host
 * at a tunnel in local dev while auth callbacks stay on the app URL.
 */
export function webhookBaseUrl(): string {
  return (process.env.GITHUB_WEBHOOK_BASE_URL ?? appUrl()).replace(/\/+$/, '');
}

/** Hosts can't deliver to loopback / private-network addresses. */
export function isUnreachableUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '0.0.0.0'
  );
}

/** The warning shown when a host can't reach `url`, so PR automation can't work. */
export function unreachableWebhookWarning(provider: VcsProvider, url: string): string {
  return `${VCS_PROVIDER_LABEL[provider]} can't reach ${url}. ${VCS_REQUEST_NOUN[provider].long} automation needs a public URL — set PUBLIC_APP_URL (or GITHUB_WEBHOOK_BASE_URL for a tunnel) and register the webhook again.`;
}
