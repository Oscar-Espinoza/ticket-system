// Absolute app origin for links that leave the browser (Slack messages, webhook
// payloads, API responses, intake embed snippets). Server-side only: the
// browser has window.location.origin (see issueUrl in issue-links.ts).

import { issuePath } from '@/lib/issue-links';

export function appUrl(): string {
  const url =
    process.env.PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000');
  return url.replace(/\/+$/, '');
}

/**
 * Better Auth's base URL (its issuer; what the SSO / SCIM / OAuth plugins
 * build their URLs from): BETTER_AUTH_URL, else the app URL, plus /api/auth.
 */
export function authBaseUrl(): string {
  return `${(process.env.BETTER_AUTH_URL || appUrl()).replace(/\/+$/, '')}/api/auth`;
}

export function absoluteIssueUrl(projectId: string, key: string): string {
  return `${appUrl()}${issuePath(projectId, key)}`;
}
