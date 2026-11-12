// Optional social sign-in providers, switched on by environment variables the
// same way Slack / web push are (empty = off, nothing registered, no UI).
// Kept free of `$app/*` and DB imports so the login pages, auth.ts and the
// tests can all read the same answer. Server-only (reads process.env).
//
// Google is identity only: openid/email/profile, no offline access, no extra
// scopes. GitHub is different (its token is used for branches/webhooks); only
// `providerId = 'github'` account rows are ever read as repo tokens
// (src/lib/github-token.ts), so a Google account row is never mistaken for one.
//
// Account linking and "Enforce SSO" need nothing provider-specific: Better
// Auth links an existing user only when the provider reports the email as
// verified AND the local email is verified (defaults, auth.ts leaves them on),
// and the session.create backstop in auth.ts refuses every non-SSO OAuth
// callback (`/callback/:id`, `/sign-in/social`) for an enforced domain.

import { githubOAuthConfigured } from '@/lib/github/oauth-config';

type Env = Record<string, string | undefined>;

export interface GoogleSignInConfig {
  clientId: string;
  clientSecret: string;
  /** Request nothing beyond Better Auth's defaults: openid, email, profile. */
  scope: string[];
}

/** Both variables must be non-blank; one without the other means "off". */
export function googleSignInConfig(env: Env = process.env): GoogleSignInConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, scope: [] };
}

/** What the login / sign-up pages read to show "Continue with Google". */
export const googleSignInEnabled = (env: Env = process.env) => googleSignInConfig(env) !== null;

/**
 * The one answer the login / sign-up pages pass to the UI: which sign-in
 * buttons to show. Each is on only when its provider is configured (GitHub's
 * rule is owned by src/lib/github/oauth-config.ts).
 */
export function signInProviders(env: Env = process.env) {
  return { githubEnabled: githubOAuthConfigured(env), googleEnabled: googleSignInEnabled(env) };
}

/** Better Auth `socialProviders` option: GitHub always (existing behaviour), Google when configured. */
export function socialProviderOptions(env: Env = process.env) {
  const google = googleSignInConfig(env);
  return {
    github: {
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET!,
      scope: ['read:user', 'user:email'],
    },
    ...(google ? { google } : {}),
  };
}
