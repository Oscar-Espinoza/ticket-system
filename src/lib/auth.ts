// Better Auth server instance — the single source of truth for all auth
// operations (consumed by the catch-all API route and every server-side
// session check).
//
// Key constraints (Plan 01-02 / RESEARCH Pattern 2, Pitfalls 1/4/6; CONTEXT D-11):
//   - database: drizzleAdapter(authDb, ...). MUST use `authDb` (neon-serverless /
//     WebSocket). neon-http throws "No transactions support" on user creation
//     (better-auth#4747).
//   - emailAndPassword.minPasswordLength: 8 (D-11) — Better Auth defaults
//     otherwise; no custom complexity rules.
//   - plugins: [nextCookies()] — lets server actions/handlers set cookies.
//   - NO cookie cache: avoids the RSC `getSession() == null` staleness bug
//     (better-auth#7008) so signed-in refresh never bounces to /login.
//   - NO `runtime = 'edge'` anywhere in the auth path — Better Auth's password
//     hashing relies on the Node runtime (bcryptjs is not Edge-safe).
//
// GitHub OAuth (socialProviders.github) signs in with MINIMAL scopes only
// (read:user, user:email — D-01). The elevated scopes (`repo`,
// `admin:repo_hook`) are requested only from Settings → GitHub via
// authClient.linkSocial({ scopes }) (D-02), which re-runs OAuth for the same
// provider and updates the existing account row's token + scope.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { jwt, twoFactor } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { scim } from '@better-auth/scim';
import { sso } from '@better-auth/sso';
import { authDb } from '@/lib/db';
import {
  users,
  sessions,
  accounts,
  verifications,
  twoFactors,
  jwks,
  ssoProviders,
  scimProviders,
  oauthClients,
  oauthAccessTokens,
  oauthRefreshTokens,
  oauthConsents,
} from '@/db/schema';

// Better Auth's Drizzle adapter resolves its logical models by looking up
// `schema[modelName]` using SINGULAR keys (`user`, `session`, `account`,
// `verification`). Our shared schema module exports PLURAL identifiers
// (`users`, `sessions`, ...) — keeping those names for app/Wave-1 code — so we
// hand the adapter an explicitly aliased map from model name to table export.
const authSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  twoFactor: twoFactors,
  jwks,
  ssoProvider: ssoProviders,
  scimProvider: scimProviders,
  oauthClient: oauthClients,
  oauthAccessToken: oauthAccessTokens,
  oauthRefreshToken: oauthRefreshTokens,
  oauthConsent: oauthConsents,
};

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8, // D-11
  },
  // GitHub OAuth (AUTH-02). Better Auth always requests read:user + user:email
  // for GitHub; `scope` below only restates them (D-01 — least privilege at
  // sign-in). Tokens are read exclusively through getGitHubToken() in
  // src/lib/github-token.ts (D-04), which decrypts them (see `account`).
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ['read:user', 'user:email'], // D-01 minimal scopes
    },
  },
  // Signed session snapshot in a cookie saves a DB lookup per request. Trade-off:
  // a revoked session stays valid up to maxAge; project membership is still
  // checked against the DB on every request. 1.6.x falls back to the DB when the
  // cache is stale (the old RSC-null bug, 01-RESEARCH Pitfall 6).
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  account: {
    // AES-256-GCM at rest now that linked tokens can carry `repo` scope (D-03
    // superseded). Rows written before this stay plaintext and still read fine.
    encryptOAuthTokens: true,
    accountLinking: {
      // Email/password users often sign in to GitHub with another address.
      // linkSocial is session-bound, so this only lets a signed-in user attach
      // a GitHub identity they just authenticated as.
      allowDifferentEmails: true,
    },
  },
  // Round-2 plugins (UIs owned by the security/API agents — see
  // .planning/features/10-MASTER-PLAN-2.md): TOTP 2FA, SAML/OIDC SSO, SCIM
  // provisioning, and an OAuth 2.0 provider (third-party "OAuth apps", with
  // jwt for signed tokens/JWKS). nextCookies must stay last.
  plugins: [
    twoFactor({ issuer: 'Ticket System' }),
    jwt(),
    oauthProvider({
      loginPage: '/login',
      consentPage: '/oauth/consent',
      scopes: ['openid', 'profile', 'email', 'offline_access', 'read', 'write'],
    }),
    sso(),
    scim(),
    nextCookies(),
  ],
});
