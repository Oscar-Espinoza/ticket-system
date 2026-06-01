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
// GitHub OAuth (socialProviders.github) is intentionally NOT configured here —
// it is wired in Plan 03 (the "Connect GitHub" / AUTH-02 flow). See the marked
// extension point below.

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
  // ── Plan 03 extension point ─────────────────────────────────────────────
  // GitHub OAuth is added here in Plan 03 (AUTH-02), e.g.:
  //   socialProviders: {
  //     github: {
  //       clientId: process.env.GITHUB_CLIENT_ID!,
  //       clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  //       scope: ['read:user', 'user:email'], // D-01 minimal scopes
  //     },
  //   },
  // Do NOT add it in Plan 02. (No socialProviders.github yet.)
  // ────────────────────────────────────────────────────────────────────────
  plugins: [nextCookies()],
});
