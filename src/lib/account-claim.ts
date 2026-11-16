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

import { m } from '@/lib/i18n';

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

/** What each item is, as a list entry, in the current language. */
export function claimItemLabel(item: ClaimItem): string {
  switch (item) {
    case 'password':
      return m.auth_claim_item_password();
    case 'twoFactor':
      return m.auth_claim_item_two_factor();
    case 'apiKeys':
      return m.auth_claim_item_api_keys();
    case 'connectedApps':
      return m.auth_claim_item_connected_apps();
    case 'linkedSignIns':
      return m.auth_claim_item_linked_sign_ins();
    case 'oauthApps':
      return m.auth_claim_item_oauth_apps();
    case 'slack':
      return m.auth_claim_item_slack();
    case 'push':
      return m.auth_claim_item_push();
    case 'invitations':
      return m.auth_claim_item_invitations();
  }
}

/** What a password-reset claim covers: everything but the password it just set. */
export const RESET_CLAIM_ITEMS: readonly ClaimItem[] = CLAIM_ITEMS.filter((item) => item !== 'password');

/** The items a report has something for, with their counts. */
export function claimedItems(report: Partial<ClaimReport> | null | undefined) {
  return CLAIM_ITEMS.filter((item) => (report?.[item] ?? 0) > 0).map((item) => ({
    item,
    count: report![item]!,
    label: claimItemLabel(item),
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
export function claimAftercare(): string[] {
  return [
    m.auth_claim_aftercare_two_factor(),
    m.auth_claim_aftercare_keys(),
    m.auth_claim_aftercare_slack_push(),
    m.auth_claim_aftercare_review(),
  ];
}

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
