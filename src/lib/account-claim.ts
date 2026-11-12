// What securing ("claiming") an unverified account removes, in the words the
// reset page, the dashboard notice and the "Your account was secured" email
// share. The claim itself: claimUnverifiedAccount in src/lib/sso.ts; the
// notice and the email: src/lib/server/account-claim.ts. Client-safe.
//
// Why a claim removes so much: before email verification existed no password
// account was verified, so the app can't tell a real early user from someone
// who registered another person's address first. Whoever proves the mailbox
// (a reset link) or the domain (the workspace's SSO) takes the account over,
// and nothing the previous holder set up may keep working for them.

/** Everything a claim removes (besides every session), in display order. */
export const CLAIM_ITEMS = [
  'password',
  'twoFactor',
  'apiKeys',
  'connectedApps',
  'linkedSignIns',
  'oauthApps',
  'slack',
  'push',
  'invitations',
] as const;

export type ClaimItem = (typeof CLAIM_ITEMS)[number];

/** How many of each item a claim removed (or would remove); 0 = none there. */
export type ClaimReport = Record<ClaimItem, number>;

export const EMPTY_CLAIM_REPORT: ClaimReport = Object.fromEntries(CLAIM_ITEMS.map((item) => [item, 0])) as ClaimReport;

/** What each item is, as a list entry. */
export const CLAIM_ITEM_LABEL: Record<ClaimItem, string> = {
  password: 'The password (sign in with single sign-on from now on)',
  twoFactor: 'Two-factor authentication (authenticator app and backup codes)',
  apiKeys: 'API keys',
  connectedApps: 'Connected apps and AI assistants (Claude, ChatGPT and other MCP or OAuth connections)',
  linkedSignIns: 'Linked Google and GitHub sign-ins',
  oauthApps: 'OAuth apps registered from this account (disabled, not deleted)',
  slack: 'The Slack link',
  push: 'Push notifications on browsers and devices',
  invitations: 'Pending invitations sent from this account',
};

/** What a password-reset claim covers: everything but the password it just set. */
export const RESET_CLAIM_ITEMS: readonly ClaimItem[] = CLAIM_ITEMS.filter((item) => item !== 'password');

/** The items a report has something for, with their counts. */
export function claimedItems(report: Partial<ClaimReport> | null | undefined) {
  return CLAIM_ITEMS.filter((item) => (report?.[item] ?? 0) > 0).map((item) => ({
    item,
    count: report![item]!,
    label: CLAIM_ITEM_LABEL[item],
  }));
}

/** A report read back from JSON (the dashboard notice, a reset response), or null. */
export function parseClaimReport(value: unknown): ClaimReport | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const report = { ...EMPTY_CLAIM_REPORT };
  for (const item of CLAIM_ITEMS) {
    const count = source[item];
    if (count === undefined) continue;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null;
    report[item] = count;
  }
  return report;
}

/** What to set up again afterwards (the success page, the notice, the email). */
export const CLAIM_AFTERCARE = [
  'Set up two-factor authentication again (Settings → Security).',
  'Create new API keys and reconnect the apps and assistants you use (Settings → API keys, Settings → OAuth apps).',
  'Link Slack and turn push notifications on again if you use them.',
  'Review your workspace’s members, pending invitations, webhooks and integrations: whoever held this account before could have changed them.',
] as const;

// --- Password reset ----------------------------------------------------------

/**
 * Body field of POST /api/auth/reset-password: `true` when the person saw the
 * list above and agreed. Required for an unverified account (the server
 * refuses the reset without it), ignored for a verified one.
 */
export const ACCOUNT_CLAIM_ACK_FIELD = 'acknowledgeAccountClaim';

/** Error code: an unverified account's reset arrived without the acknowledgement. */
export const ACCOUNT_CLAIM_NOT_ACKNOWLEDGED = 'ACCOUNT_CLAIM_NOT_ACKNOWLEDGED';

/** Error code: the password was set but securing the account failed; a new link finishes it. */
export const ACCOUNT_CLAIM_FAILED = 'ACCOUNT_CLAIM_FAILED';

/**
 * POST { token } → ResetClaimPreview: whether resetting with this link
 * secures an unverified account, and what is there to remove. The token goes
 * in the body, never in a URL. An unknown, used or expired token answers the
 * same as a verified account's: { claim: false }.
 */
export const RESET_CLAIM_PREVIEW_PATH = '/api/password-reset/preview';

export type ResetClaimPreview = { claim: false } | { claim: true; removes: ClaimReport };
