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
// GitHub OAuth (socialProviders.github) is wired in Plan 03 (AUTH-02) with
// MINIMAL scopes only (read:user, user:email — D-01). Elevated GitHub scopes
// (repository write + webhook admin) are deferred to the Phase 7
// Connect-GitHub flow (D-02) and are explicitly NOT requested here.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { authDb } from '@/lib/db';
import {
  users,
  sessions,
  accounts,
  verifications,
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
  // GitHub OAuth (AUTH-02). The explicit `scope` array OVERRIDES Better Auth's
  // default scope list (assumption A4), so the access token carries ONLY
  // read:user + user:email (D-01 — least privilege). We deliberately do NOT
  // request repository-write or webhook-admin scopes; those elevated scopes
  // belong to the Phase 7 Connect-GitHub flow (D-02). The token is stored
  // plaintext for v1 (D-03 — acceptable while it only grants the two read
  // scopes above) and is read
  // exclusively through getGitHubToken() in src/lib/github-token.ts (D-04).
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ['read:user', 'user:email'], // D-01 minimal scopes — A4 override
    },
  },
  plugins: [nextCookies()],
});
