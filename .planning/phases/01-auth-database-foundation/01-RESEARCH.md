# Phase 1: Auth + Database Foundation - Research

**Researched:** 2026-06-01
**Domain:** Next.js 15 App Router + Better Auth 1.6 + Drizzle ORM + Neon Postgres
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** GitHub sign-in requests minimal scopes only: `read:user` + `user:email`. Stored token has no repo access in Phase 1.

**D-02:** Elevated scopes (`repo`, `admin:repo_hook`) deferred to Phase 7 "Connect GitHub" flow, for both GitHub-login and email/password users.

**D-03:** Accept Better Auth's default plaintext storage of the GitHub `access_token` in the `accounts` table for v1. Token carries only `read:user`/`user:email` until Phase 7.

**D-04:** Isolate all token reads behind a small accessor function (`getGitHubToken(userId)`) so AES-256-GCM encryption in Phase 7 is a localized change. Encryption deferred to Phase 7.

**D-05 (reaffirms):** GitHub token is NEVER placed in the session JWT — the session carries only a derived `githubConnected: boolean`.

**D-06:** Define the full column-level schema for all 7 tables in one foundational migration: `users`, `accounts`, `sessions` (Better Auth core), plus `projects`, `project_members`, `invitations`, `tickets`.

**D-07:** Ticket status enum locked: `backlog, todo, in_progress, in_review, done`.

**D-08:** Enforce per-project ticket-number uniqueness at schema level now — unique constraint on `(project_id, ticket_number)`. Counter logic is Phase 5; the constraint lives here.

**D-09:** Authenticated users land on minimal `/dashboard` showing greeting, email/name, GitHub-connected status, and logout button. Becomes project-list shell in Phase 2.

**D-10:** Unauthenticated access to protected routes redirects to `/login`. Logout must clear session. Signed-in refresh must NOT bounce to login.

**D-11:** Signup validation uses Better Auth defaults + 8-character minimum password. Clear inline error on duplicate email. No custom complexity rules.

### Claude's Discretion

- Session mechanism details (cookie-cache/expiry tuning, unless a success criterion forces a choice).
- Exact migration tooling invocation (`drizzle-kit push` for dev vs `generate`+`migrate` for prod).
- Whether the protected-route guard is layout-level server check or middleware redirect — implement as server-side check (middleware is NOT the security boundary per CVE-2025-29927).

### Deferred Ideas (OUT OF SCOPE)

- AES-256-GCM encryption of the GitHub token — Phase 7.
- Elevated GitHub OAuth scopes / "Connect GitHub" flow — Phase 7 (GH-01).
- Project list UI — Phase 2; `/dashboard` placeholder is the seam.
- Better Auth Organization plugin vs hand-rolled project tables — Phase 2 planning.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can create an account with email and password | Better Auth `emailAndPassword` provider with `minPasswordLength: 8`; `signUp.email()` client call; server-side `auth.ts` with Drizzle adapter |
| AUTH-02 | User can sign in with GitHub OAuth | Better Auth `socialProviders.github` with `scope: ["read:user","user:email"]`; GitHub OAuth App credentials; callback URL at `/api/auth/callback/github` |
| AUTH-03 | User can log in with email/password and stay logged in across browser refreshes | Better Auth default cookie-based sessions with 7-day `expiresIn`; `sessions` table in Neon; `auth.api.getSession({ headers })` in server components |
| AUTH-04 | User can log out from any page | `authClient.signOut()` in client component; redirect to `/login` after clearance |

</phase_requirements>

---

## Summary

Phase 1 is a greenfield scaffold. The Next.js 15 app does not yet exist — `create-next-app` is the first step. The phase wires three discrete technical domains: (1) Better Auth 1.6 with dual Neon database drivers, (2) the complete 7-table Drizzle schema with migrations, and (3) three UI pages (login, signup, dashboard) using shadcn/ui.

The most operationally significant constraint is the **dual-driver requirement**: Better Auth must receive a Drizzle instance backed by `drizzle-orm/neon-serverless` (WebSocket) because it performs interactive transactions during user creation and session management. A second Drizzle instance backed by `drizzle-orm/neon-http` serves all application queries. The two instances share the same `DATABASE_URL` but differ in their driver. [CITED: better-auth/better-auth#4747]

A critical **version-pin decision** exists regarding `@neondatabase/serverless`. The CLAUDE.md pin is `^0.10.4`. Research shows drizzle-orm 0.45.0 (released 2025-12-04) includes compatibility fixes for `@neondatabase/serverless >=1.0.0` with the neon-http driver. However, because (a) the fix's exact scope is not verified against an authoritative changelog entry, (b) the CLAUDE.md pin is explicitly locked with rationale, and (c) the safe floor (`^0.10.4`) is confirmed to work, **this research does not override the pin**. The planner must pin `@neondatabase/serverless@^0.10.4` per D-06 constraints. If the team wants to upgrade, drizzle-orm#5208 should be re-checked at upgrade time.

The protected-route strategy must use **server-side checks only** (not middleware as the security boundary) due to CVE-2025-29927, which allows bypassing Next.js middleware via a spoofed `x-middleware-subrequest` header. [CITED: CVE-2025-29927 advisory]

**Primary recommendation:** Scaffold Next.js, wire dual Neon drivers, configure Better Auth with `neon-serverless` adapter, run `npx @better-auth/cli generate` to emit the Better Auth schema, then hand-write the app-domain tables (`projects`, `project_members`, `invitations`, `tickets`) in the same Drizzle schema file, then run `drizzle-kit generate` + `drizzle-kit migrate` for the combined migration.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email/password sign-up and sign-in | API / Backend (Node runtime) | Browser (client auth SDK) | Password hashing (bcryptjs) requires Node runtime; cannot run on Edge |
| GitHub OAuth redirect flow | API / Backend (Better Auth handler) | Browser (redirect initiation) | OAuth callback processed by Better Auth at `/api/auth/[...all]` |
| Session validation on protected pages | Frontend Server (SSR layout/page) | — | `auth.api.getSession({ headers })` in Server Components; server-side redirect if no session |
| Session cookie management | API / Backend (Better Auth) | — | Better Auth writes and clears `better-auth.session` cookie via `Set-Cookie` |
| Database schema + migrations | Database / Storage | — | Drizzle schema defines all 7 tables; drizzle-kit applies migrations to Neon |
| Token accessor (`getGitHubToken`) | API / Backend | — | Server-only DB read; never exposed to client |
| Dashboard GitHub-connected status | Frontend Server (SSR) | — | `auth.api.listUserAccounts()` + filter for `providerId === 'github'` in server component |
| Logout | Browser (client event) | API / Backend (session clear) | `authClient.signOut()` calls Better Auth endpoint which clears cookie, then client redirects |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.6 | Full-stack framework | [VERIFIED: npm registry] Official Next.js; App Router default; Vercel Hobby compatible |
| react + react-dom | 19.2.7 | UI runtime | [VERIFIED: npm registry] Included with create-next-app; canary builds stable for App Router |
| typescript | 5.x (bundled) | Type safety | [VERIFIED: npm registry] Ships with create-next-app scaffold |
| better-auth | 1.6.13 | Authentication | [VERIFIED: npm registry] Current stable; email/password + GitHub OAuth + Drizzle adapter; last published 2026-05-31 |
| drizzle-orm | 0.45.2 | Type-safe ORM | [VERIFIED: npm registry] Current stable; includes neon-http + neon-serverless drivers |
| @neondatabase/serverless | **pin 0.10.4** | Neon DB driver | [VERIFIED: npm registry] Per locked constraint — 0.10.4 exists and is confirmed working with drizzle-orm/neon-http |
| drizzle-kit | 0.31.10 | Migration CLI | [VERIFIED: npm registry] Dev dependency; `generate` creates SQL files; `migrate` applies them |
| tailwindcss | 4.3.0 | CSS framework | [VERIFIED: npm registry] v4 CSS-first; shadcn/ui CLI scaffolds v4 by default for new projects |
| bcryptjs | 3.0.3 | Password hashing | [VERIFIED: npm registry] Pure-JS bcrypt; Node runtime only (not Edge); last published 2025-11-02 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | CLI (no npm version) | Component primitives | Installed via `npx shadcn@latest add <component>` — components are copied into repo |
| lucide-react | 1.17.0 | Icons | [VERIFIED: npm registry] Default shadcn icon set; `Github`, `CheckCircle`, `CircleOff`, `Loader2` used in Phase 1 |
| @dnd-kit/react | 0.4.0 | Drag-and-drop | [VERIFIED: npm registry] Kanban board (Phase 6) — schema only created in Phase 1, not wired |
| @dnd-kit/helpers | 0.4.0 | Sortable utilities | [VERIFIED: npm registry] Required alongside @dnd-kit/react for `move()` |
| @octokit/rest | 22.0.1 | GitHub API client | [VERIFIED: npm registry] Phase 7 only — not installed in Phase 1 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `better-auth@1.6` | `next-auth@5.0.0-beta` | Auth.js v5 is in security-patch-only mode; Better Auth is its successor for new projects |
| `drizzle-orm/neon-serverless` for auth | `drizzle-orm/neon-http` for auth | neon-http throws "No transactions support" when Better Auth creates users; WebSocket required |
| `bcryptjs` | `node:crypto scrypt` | scrypt is slightly better security with zero dependency; bcryptjs is simpler and battle-tested |
| `drizzle-kit generate + migrate` | `drizzle-kit push` | `push` is faster for dev iteration but not auditable; `generate + migrate` produces versioned SQL files |

**Installation (Phase 1 packages only):**

```bash
# Scaffold Next.js app (interactive — select new-york for shadcn when prompted)
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir

# Auth + DB runtime
npm install better-auth drizzle-orm @neondatabase/serverless@^0.10.4 bcryptjs
npm install --save-dev drizzle-kit @types/bcryptjs

# UI components (run after shadcn init)
npx shadcn@latest init   # select new-york style
npx shadcn@latest add button input label card badge separator
```

---

## Package Legitimacy Audit

> slopcheck was denied by sandbox policy. Manual verification performed via npm registry + official GitHub repos.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| better-auth | npm | 1.5 yrs | High (active project) | github.com/better-auth/better-auth | [ASSUMED] | Approved — official project, official docs at better-auth.com |
| drizzle-orm | npm | 3+ yrs | Very high | github.com/drizzle-team/drizzle-orm | [ASSUMED] | Approved — official ORM, official docs at orm.drizzle.team |
| @neondatabase/serverless | npm | 3+ yrs (created 2022-11-09) | Very high | github.com/neondatabase/serverless | [ASSUMED] | Approved — official Neon driver |
| drizzle-kit | npm | 3+ yrs | Very high | github.com/drizzle-team/drizzle-orm | [ASSUMED] | Approved — official drizzle CLI |
| next | npm | 10+ yrs | 100M+/wk | github.com/vercel/next.js | [ASSUMED] | Approved |
| bcryptjs | npm | 10+ yrs (dcodeIO, active) | High | github.com/dcodeIO/bcrypt.js | [ASSUMED] | Approved |
| lucide-react | npm | 4+ yrs | Very high | github.com/lucide-icons/lucide | [ASSUMED] | Approved |
| @dnd-kit/react | npm | Recent (0.4.0 only) | Moderate | github.com/clauderic/dnd-kit | [ASSUMED] | Approved — official successor to @dnd-kit/core by same author |

**Packages removed due to slopcheck [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none — all packages have established GitHub repos, official documentation sites, and match the names referenced in their own official docs.

*slopcheck was unavailable at research time; all packages above are tagged `[ASSUMED]`. Planner should note that each install should be confirmed by human before proceeding if supply-chain verification is required.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │
  ├─── GET /login, /signup ──────────────────────────────► Next.js Server (RSC)
  │                                                              │
  │    POST /api/auth/[...all]  ◄─── authClient.signIn() ◄─────┤
  │         │                                                    │
  │         ▼                                                    │
  │    Better Auth handler ──► Drizzle (neon-serverless) ──► Neon Postgres
  │         │                     (interactive transactions)
  │         │  Set-Cookie: better-auth.session
  │         ▼
  ├─── GET /dashboard ──────────────────────────────────► Next.js Server (RSC)
  │                                                              │
  │                                                    auth.api.getSession()
  │                                                              │
  │                                               ┌─────── session valid? ─────┐
  │                                               │ NO: redirect /login        │ YES
  │                                               └────────────────────────    ▼
  │                                                              Drizzle (neon-http)
  │                                                              (app queries — read)
  │                                                              │
  │                                                              ▼
  │                                                         Render dashboard
  │
  └─── POST /api/auth/sign-out ◄── authClient.signOut() ► Better Auth ► Clear cookie ► redirect /login
```

### Recommended Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...all]/
│   │           └── route.ts        # Better Auth handler
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx            # Login page (client component)
│   │   └── signup/
│   │       └── page.tsx            # Signup page (client component)
│   ├── dashboard/
│   │   ├── layout.tsx              # Server component — auth guard lives here
│   │   └── page.tsx                # Dashboard content (server component)
│   ├── layout.tsx                  # Root layout
│   └── globals.css                 # Tailwind v4 CSS-first (@theme directives)
├── components/
│   └── ui/                         # shadcn/ui copied components
├── lib/
│   ├── auth.ts                     # Better Auth server instance
│   ├── auth-client.ts              # Better Auth client instance
│   ├── db.ts                       # Dual Drizzle instances (http + ws)
│   └── github-token.ts             # getGitHubToken() accessor (D-04 seam)
└── db/
    ├── schema.ts                   # All 7 Drizzle tables
    └── migrations/                 # drizzle-kit generated SQL files
drizzle.config.ts                   # drizzle-kit config
```

### Pattern 1: Dual Neon Driver Setup

**What:** Two Drizzle instances with different drivers sharing one `DATABASE_URL`.
**When to use:** Always — `db` for app queries (HTTP, faster), `authDb` for Better Auth (WebSocket, transaction support).

```typescript
// src/lib/db.ts
// Source: https://orm.drizzle.team/docs/connect-neon

import { neon } from '@neondatabase/serverless';
import { Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import * as schema from '@/db/schema';

// App queries — HTTP (no transactions, fast single-query)
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzleHttp({ client: sql, schema });

// Better Auth writes — WebSocket (interactive transactions required)
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const authDb = drizzleWs({ client: pool, schema });
```

### Pattern 2: Better Auth Server Instance

**What:** Single auth.ts file consumed by the API route handler and server-side session checks.
**When to use:** All auth operations route through this instance.

```typescript
// src/lib/auth.ts
// Source: https://www.better-auth.com/docs/installation

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { authDb } from '@/lib/db';

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,     // D-11
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ['read:user', 'user:email'],  // D-01: minimal scopes only
    },
  },
  plugins: [nextCookies()],   // auto-sets cookies in server actions
});
```

### Pattern 3: Better Auth API Route Handler

**What:** Catch-all route handler that Better Auth uses for all auth endpoints.
**When to use:** Required — all auth API calls go through this handler.

```typescript
// src/app/api/auth/[...all]/route.ts
// Source: https://www.better-auth.com/docs/integrations/next

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

### Pattern 4: Server-Side Auth Guard (Layout)

**What:** Server component layout that checks session before rendering protected content.
**When to use:** All protected route groups — NOT middleware (CVE-2025-29927).

```typescript
// src/app/dashboard/layout.tsx
// Source: https://better-auth.com/docs/integrations/next (server-side check pattern)

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  return <>{children}</>;
}
```

### Pattern 5: GitHub-Connected Status (D-05 compliant)

**What:** Check if the user has a GitHub account linked by querying the accounts table. Never from session JWT.
**When to use:** Dashboard page to show connected/not-connected badge.

```typescript
// src/app/dashboard/page.tsx (server component)
// Source: https://better-auth.com/docs/concepts/users-accounts

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  
  const accounts = await auth.api.listUserAccounts({
    headers: await headers(),
  });
  
  const githubConnected = accounts?.some(
    (account) => account.providerId === 'github'
  ) ?? false;

  return (/* render greeting + badge */);
}
```

### Pattern 6: GitHub Token Accessor (D-04 seam)

**What:** Isolated function that reads the GitHub access token from the accounts table.
**When to use:** Any Phase 7+ server action that needs the stored GitHub token.

```typescript
// src/lib/github-token.ts
// Source: D-04 decision — accessor seam for future AES-256-GCM encryption

import { db } from '@/lib/db';
import { accounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function getGitHubToken(userId: string): Promise<string | null> {
  const [account] = await db
    .select({ accessToken: accounts.accessToken })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.providerId, 'github')
      )
    )
    .limit(1);
  
  return account?.accessToken ?? null;
  // Phase 7: decrypt with AES-256-GCM here before returning
}
```

### Pattern 7: Auth-Redirected Auth Pages

**What:** Redirect already-authenticated users away from /login and /signup to /dashboard.
**When to use:** Login and signup pages (server-side check at top of page component).

```typescript
// src/app/(auth)/login/page.tsx — server component wrapper
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/dashboard');
  return <LoginForm />;  // client component with authClient calls
}
```

### Anti-Patterns to Avoid

- **Middleware as auth boundary:** CVE-2025-29927 allows bypassing it via spoofed `x-middleware-subrequest` header. Use server-side checks only. Middleware may be used for non-security UX (e.g., locale) but NOT auth.
- **Using `drizzle-orm/neon-http` for the Better Auth `database` config:** Throws "No transactions support in neon-http driver" on user creation. [CITED: better-auth/better-auth#4747]
- **Importing `bcryptjs` in middleware.ts or any Edge runtime route:** `bcryptjs` uses `process.nextTick` which is unavailable on Edge. Keep all auth handlers on Node runtime.
- **Storing GitHub access token in session JWT:** Violates D-05. The session may be decoded by the client. Store only `githubConnected: boolean` derived at render time.
- **Using `@neondatabase/serverless@^1.0.0` without verifying drizzle-orm fix scope:** Until the fix is confirmed in an authoritative drizzle-orm changelog, keep the `^0.10.4` pin.
- **Running `npx auth@latest generate` without the auth.ts file in place:** The CLI discovers the config by scanning for `auth.ts` or `auth.js` in standard locations. Run it only after `src/lib/auth.ts` exists.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookies (httpOnly, secure, SameSite) | Custom cookie management | Better Auth — handles automatically | Edge cases in cookie rotation, expiry, and CSRF SameSite policy are subtle |
| Password hashing + salt | Custom hash function | `bcryptjs` via Better Auth's default scrypt OR explicit `bcryptjs` | Timing-safe comparison, proper salt generation, cost factor calibration are all handled |
| CSRF protection for auth forms | Custom CSRF tokens | Better Auth — built-in CSRF mitigations via SameSite cookies | SameSite=Lax covers the overwhelming majority of CSRF vectors |
| OAuth state parameter | Custom OAuth flow | Better Auth `socialProviders.github` | State param, PKCE, token exchange, and callback handling are all managed |
| Session refresh / sliding expiry | Custom session refresh | Better Auth `session.updateAge` (default: 1 day) | Race conditions in concurrent session refresh are hard to handle correctly |
| DB schema from Better Auth core tables | Manual table definitions | `npx @better-auth/cli generate` | CLI generates correct schema including foreign keys and indexes for the configured plugins |

**Key insight:** Better Auth's core value is eliminating all auth plumbing. The only custom code is the application-domain schema (`projects`, `project_members`, `invitations`, `tickets`) and the `getGitHubToken` accessor.

---

## Common Pitfalls

### Pitfall 1: neon-http "No transactions support" with Better Auth

**What goes wrong:** User creation throws `Error: No transactions support in neon-http driver`.
**Why it happens:** Better Auth wraps user creation + account creation in an interactive transaction. The neon-http driver does not support interactive (multi-statement) transactions.
**How to avoid:** Always pass `authDb` (backed by `drizzle-orm/neon-serverless`) to `drizzleAdapter()` in `auth.ts`. Use `db` (neon-http) only for application-layer queries.
**Warning signs:** Error message containing "No transactions support" during sign-up.
[CITED: github.com/better-auth/better-auth/issues/4747]

### Pitfall 2: @neondatabase/serverless version mismatch

**What goes wrong:** `drizzle-orm/neon-http` queries fail with "This function can now be called only as a tagged-template function".
**Why it happens:** `@neondatabase/serverless@1.0.0` changed the `neon()` function to only accept tagged-template syntax. Drizzle's neon-http adapter calls it with conventional function syntax.
**How to avoid:** Pin to `@neondatabase/serverless@^0.10.4` in package.json. Run `npm install @neondatabase/serverless@^0.10.4` explicitly; do not let npm upgrade past 0.10.4.
**Warning signs:** All neon-http queries fail immediately after `npm update` or package reinstall.
[CITED: github.com/drizzle-team/drizzle-orm/issues/5208]

### Pitfall 3: CVE-2025-29927 Middleware Bypass

**What goes wrong:** An attacker sends `x-middleware-subrequest: middleware` header, bypassing all middleware authentication checks and accessing protected pages unauthenticated.
**Why it happens:** Next.js middleware trusts this internal header to prevent recursion. External requests should never set it, but no validation exists in vulnerable versions.
**How to avoid:** Never use middleware as the sole authentication boundary. Place `auth.api.getSession()` checks in server-side layouts/pages.
**Warning signs:** Trusting only `middleware.ts` for protected route enforcement.
[CITED: CVE-2025-29927, github.com/advisories/GHSA-f82v-jwr5-mffw]

### Pitfall 4: bcryptjs in Edge Runtime

**What goes wrong:** `ReferenceError: process is not defined` or `Error: crypto module not available` when bcryptjs is imported in middleware or an Edge route.
**Why it happens:** bcryptjs uses `process.nextTick` and Node.js crypto APIs which are absent in the Vercel Edge runtime.
**How to avoid:** Keep all routes that import bcryptjs (directly or through Better Auth) on Node.js runtime. Ensure no `export const runtime = 'edge'` exists in login/signup route files.
**Warning signs:** Auth routes have `runtime = 'edge'` declarations; middleware imports auth helpers.

### Pitfall 5: Better Auth CLI schema vs app schema conflict

**What goes wrong:** Running `npx @better-auth/cli generate` overwrites or conflicts with manually written app tables in `schema.ts`.
**Why it happens:** The CLI outputs to `schema.ts` in project root by default.
**How to avoid:** Use `--output src/db/schema.ts` flag to direct output. Better yet: generate to a temporary file, then copy only the Better Auth tables (users, accounts, sessions, verification) into your main schema file, then hand-write the app tables (`projects`, `project_members`, `invitations`, `tickets`) in the same file.
**Warning signs:** App tables are missing after a regeneration.

### Pitfall 6: auth.api.getSession returning null in RSC with cookie cache

**What goes wrong:** `auth.api.getSession({ headers: await headers() })` returns `null` in React Server Components despite a valid session, particularly when cookie cache is enabled.
**Why it happens:** RSC cannot set cookies; cookie cache staleness is not resolved until a client interaction occurs.
**How to avoid:** For Phase 1, do not enable cookie cache. Default Better Auth configuration (database sessions, no cookie cache) works correctly with `await headers()`.
**Warning signs:** Random redirect-to-login on browser refresh despite being signed in. [CITED: github.com/better-auth/better-auth/issues/7008]

### Pitfall 7: Duplicate email error handling

**What goes wrong:** Signup with an existing email returns HTTP 422 with code `USER_ALREADY_EXISTS` — but if `requireEmailVerification` is enabled or `autoSignIn: false`, the same endpoint returns 200 (email enumeration protection). The error handling path must account for this.
**Why it happens:** Better Auth deliberately obfuscates the duplicate-email case when enumeration protection is on.
**How to avoid:** Phase 1 uses default config (no email verification required), so the 422 + `USER_ALREADY_EXISTS` error code path is reliable. If email verification is added later, update error handling.
**Warning signs:** Signup form silently succeeds without actually creating an account.

---

## Code Examples

### Drizzle Schema — Better Auth Core Tables

```typescript
// src/db/schema.ts (Better Auth core — generated from npx @better-auth/cli generate then adapted)
// Source: https://www.better-auth.com/docs/concepts/database

import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});
```

### Drizzle Schema — App Domain Tables (D-06/D-07/D-08)

```typescript
// src/db/schema.ts (app domain tables — hand-written per D-06)
// Source: D-06, D-07, D-08 from CONTEXT.md

import { pgTable, text, timestamp, integer, pgEnum, unique } from 'drizzle-orm/pg-core';

export const ticketStatusEnum = pgEnum('ticket_status', [
  'backlog', 'todo', 'in_progress', 'in_review', 'done',  // D-07
]);

export const projects = pgTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ticketKey: text('ticket_key').notNull().unique(),   // e.g. "APP"
  ticketCounter: integer('ticket_counter').notNull().default(0),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  githubRepo: text('github_repo'),                   // Phase 4/7 — nullable now
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const projectMembers = pgTable('project_member', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const invitations = pgTable('invitation', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const tickets = pgTable('ticket', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ticketNumber: integer('ticket_number').notNull(),    // per-project sequential number
  title: text('title').notNull(),
  description: text('description'),
  status: ticketStatusEnum('status').notNull().default('backlog'),
  assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  githubBranch: text('github_branch'),                // Phase 7 — nullable now
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, (table) => ({
  uniqueProjectTicket: unique().on(table.projectId, table.ticketNumber),  // D-08
}));
```

### drizzle.config.ts

```typescript
// drizzle.config.ts
// Source: https://orm.drizzle.team/docs/connect-neon

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Auth Client Setup

```typescript
// src/lib/auth-client.ts
// Source: https://www.better-auth.com/docs/installation

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
});
```

### Client-Side Sign-Up with Duplicate Email Handling

```typescript
// Source: https://www.better-auth.com/docs/authentication/email-password

const { data, error } = await authClient.signUp.email({
  name,
  email,
  password,
  callbackURL: '/dashboard',
});

if (error) {
  if (error.code === 'USER_ALREADY_EXISTS') {
    setEmailError('An account with this email already exists. Sign in instead.');
  } else if (error.status === 422) {
    setPasswordError('Password must be at least 8 characters.');
  } else {
    setFormError('Something went wrong. Please try again.');
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auth.js v5 (next-auth@5) | Better Auth 1.6 | 2025 — Better Auth team took Auth.js ownership | New projects should use Better Auth; Auth.js is security-patch-only |
| `@dnd-kit/core` | `@dnd-kit/react@0.4.x` | 2024-2025 | New API with React 19 type compatibility; old package no longer maintained |
| Tailwind config via `tailwind.config.js` | CSS-first `@theme` in `globals.css` | Tailwind v4 (2025) | No JS config file; content auto-detected; OKLCH color tokens |
| `neon-http` for all Drizzle usage | Split: neon-http for app, neon-serverless for auth | Better Auth#4747 disclosure | Auth must use WebSocket driver for transaction support |
| Middleware as the auth security boundary | Server-side layout/page check | CVE-2025-29927 (March 2025) | Middleware can be bypassed; server components provide the real boundary |

**Deprecated/outdated:**

- `next-auth@5.0.0-beta` for new projects: Officially in maintenance mode; Better Auth team directs new users away. [CITED: authjs.dev/getting-started/migrate-to-better-auth]
- `@dnd-kit/core` (legacy): Last published ~1 year ago; use `@dnd-kit/react@0.4.x`.
- `react-beautiful-dnd` / `@hello-pangea/dnd`: Poor React 19 peer dependency support.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | drizzle-orm 0.45.x is fully compatible with `@neondatabase/serverless@1.x` for the neon-http driver | Standard Stack / Pitfall 2 | LOW risk — we pin `^0.10.4` regardless; A1 only matters if upgrading |
| A2 | `auth.api.listUserAccounts()` accepts a `headers` parameter for server-side use | Pattern 5 | MEDIUM — if the API only works client-side, the dashboard must use a direct DB query against `accounts` table filtered by `userId` and `providerId = 'github'` |
| A3 | `better-auth/adapters/drizzle` is the correct import path for the Drizzle adapter in 1.6.x | Standard Stack | LOW — confirmed in official docs; would surface as module not found at build time |
| A4 | The `scope` array on `socialProviders.github` overrides the default scope list rather than extending it | Pattern 2 | MEDIUM — if it extends, the token still only gets `read:user`+`user:email`+defaults which is acceptable; if defaults include `repo` already that contradicts D-01 |
| A5 | `npx @better-auth/cli generate` with `--output src/db/schema.ts` will generate correct Drizzle-flavored PG schema for the 4 core tables | Pattern 5 / Pitfall 5 | MEDIUM — if it generates to a different format or location, the executor will need to merge manually |

---

## Open Questions (RESOLVED)

1. **`auth.api.listUserAccounts()` server-side signature**
   - What we know: Client-side `authClient.listAccounts()` works; server-side `auth.api.*` endpoints generally accept `{ headers }`.
   - What's unclear: Whether `listUserAccounts` specifically accepts headers param or requires `userId` from the session.
   - Recommendation: During implementation, fall back to direct Drizzle query if the API call fails: `db.select().from(accounts).where(and(eq(accounts.userId, session.user.id), eq(accounts.providerId, 'github')))`.
   - **RESOLVED:** Plan 01-03 Task 1 specifies both paths — prefer `auth.api.listUserAccounts({ headers: await headers() })`, fall back to the direct Drizzle query above if unavailable server-side. No runtime ambiguity remains for the planner/executor.

2. **drizzle-kit 0.31.x compatibility with drizzle-orm 0.45.x + neon-http**
   - What we know: Both are current versions from the drizzle-team monorepo. drizzle-kit is a CLI dev tool that reads the schema file; it is not involved in runtime queries.
   - What's unclear: Whether the `defineConfig` shape has changed between 0.30.x and 0.31.x.
   - Recommendation: Use `drizzle-kit push` for initial dev setup (fastest feedback loop), then switch to `generate + migrate` before first Vercel deployment.
   - **RESOLVED:** Plan 01-01 Task 3 commits to the versioned `npx drizzle-kit generate` + `npx drizzle-kit migrate` path (migration files are an explicit success criterion), avoiding the `push`-only flow entirely.

3. **Next.js 16 vs Next.js 15 for scaffolding**
   - What we know: `npx create-next-app@latest` installs Next.js 16.2.6 (as of 2026-06-01). CLAUDE.md specifies "Next.js 15.x (latest)" but registry shows 16.x.
   - What's unclear: Whether the team intends to pin to 15.x or wants current stable.
   - Recommendation: Use `create-next-app@latest` (installs 16.2.6). All patterns in this research apply equally to Next.js 15 and 16 App Router. If the user wants to pin to 15, use `npx create-next-app@15`.
   - **RESOLVED:** Orchestrator + user explicitly chose Next.js 16.2.6 (`create-next-app@latest`) during plan-phase. Recorded in SKELETON.md and Plan 01-01 Task 1.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 22.14.0 | — |
| npm | Package install | ✓ | 10.9.2 | — |
| npx | create-next-app, shadcn CLI, drizzle-kit, better-auth CLI | ✓ | (bundled with npm) | — |
| git | Version control | ✓ | 2.43.0 | — |
| curl | Health checks | ✓ | 8.5.0 | — |
| Neon Postgres (cloud) | Database | Needs account | — | Create free account at neon.tech before executing |
| GitHub OAuth App | AUTH-02 | Needs setup | — | Create at github.com/settings/developers before executing |

**Missing dependencies with no fallback:**

- **Neon Postgres connection string:** Must create a Neon project and copy `DATABASE_URL` into `.env.local` before running migrations. Free tier at neon.tech; no credit card required.
- **GitHub OAuth App credentials:** Must create a GitHub OAuth App to get `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Callback URL must be set to `http://localhost:3000/api/auth/callback/github` (dev) and the production URL (prod).

**GitHub OAuth App setup steps:**

1. Go to github.com/settings/developers → OAuth Apps → New OAuth App
2. Application name: (any)
3. Homepage URL: `http://localhost:3000`
4. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
5. Copy Client ID and generate Client Secret

**Required .env.local variables:**

```
DATABASE_URL=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=<from GitHub OAuth App>
GITHUB_CLIENT_SECRET=<from GitHub OAuth App>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed yet — greenfield repo |
| Config file | Wave 0 must create `jest.config.ts` or `vitest.config.ts` |
| Quick run command | `npm test -- --testPathPattern=auth` |
| Full suite command | `npm test` |

**Recommended:** Vitest (fast, ESM-native, compatible with Next.js 15/16 and TypeScript without extra config). Install: `npm install --save-dev vitest @vitejs/plugin-react`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Email/password account creation persists to DB | Integration | `vitest run tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-01 | Duplicate email returns USER_ALREADY_EXISTS error | Integration | `vitest run tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-01 | Password < 8 chars rejected | Unit | `vitest run tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-02 | GitHub OAuth callback creates/links account | Manual | Manual browser test | — |
| AUTH-03 | Session cookie present after sign-in | Integration | `vitest run tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-03 | Unauthenticated request to /dashboard returns 302 to /login | Integration | `vitest run tests/routing.test.ts` | ❌ Wave 0 |
| AUTH-04 | Sign-out clears session cookie | Integration | `vitest run tests/auth.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run lint && npm run build` (no test suite yet in Wave 0)
- **Per wave merge:** `vitest run` (full suite after Wave 0 creates tests)
- **Phase gate:** All integration tests green + manual GitHub OAuth flow verified before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/tests/auth.test.ts` — covers AUTH-01, AUTH-03, AUTH-04
- [ ] `src/tests/routing.test.ts` — covers AUTH-03 protected route redirect
- [ ] `vitest.config.ts` — test runner config
- [ ] `src/tests/setup.ts` — shared fixtures (test DB connection, mock session)
- [ ] Framework install: `npm install --save-dev vitest @vitejs/plugin-react` — if approved

*Note: GitHub OAuth (AUTH-02) cannot be fully automated in unit/integration tests without a real OAuth flow. Treat it as a manual smoke test: sign in with GitHub in a browser against localhost:3000.*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth `emailAndPassword` + `socialProviders.github`; `bcryptjs` (default scrypt via Better Auth, or explicit bcryptjs) |
| V3 Session Management | yes | Better Auth database sessions; httpOnly cookie; 7-day expiry; `auth.api.getSession()` on every protected request |
| V4 Access Control | yes | Server-side layout guard (`auth.api.getSession()` + redirect); never middleware-only |
| V5 Input Validation | yes | Better Auth validates email format + `minPasswordLength: 8`; React form validation for UX |
| V6 Cryptography | partial | Password hashing via Better Auth default (scrypt); no hand-rolled crypto in Phase 1; AES-256-GCM deferred to Phase 7 |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Middleware auth bypass (CVE-2025-29927) | Elevation of privilege | Server-side `auth.api.getSession()` in layout — not middleware-only |
| Session fixation | Elevation of privilege | Better Auth issues new session token on login (default) |
| Email enumeration via sign-up error | Information disclosure | Better Auth returns 422 + `USER_ALREADY_EXISTS` by default; acceptable for Phase 1 (no email verification). If email verification is later added, the error becomes opaque. |
| GitHub token stored plaintext (D-03) | Information disclosure | Accepted risk for Phase 1 (token has only `read:user`/`user:email`); accessor seam (D-04) prepares for Phase 7 encryption |
| GitHub token in session JWT (D-05) | Information disclosure | BLOCKED — session carries only `githubConnected: boolean`; token read from DB at action time via `getGitHubToken()` |
| bcryptjs on Edge runtime | Tampering (crashes auth routes) | Never `export const runtime = 'edge'` in login/signup handlers |
| IDOR on project/ticket endpoints | Tampering | Not in scope for Phase 1; `requireProjectMember()` DAL helper established in Phase 2 |

---

## Sources

### Primary (HIGH confidence)

- [Better Auth installation docs](https://better-auth.com/docs/installation) — `betterAuth()` config shape, drizzle adapter, `toNextJsHandler`, `.env` vars
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next) — `auth.api.getSession({ headers })`, `nextCookies()` plugin, `toNextJsHandler`
- [Better Auth email/password docs](https://better-auth.com/docs/authentication/email-password) — `minPasswordLength`, `USER_ALREADY_EXISTS` error code, `signUp.email()` / `signIn.email()` client API
- [Better Auth GitHub OAuth docs](https://better-auth.com/docs/authentication/github) — `socialProviders.github`, `scope` array, redirect URL setup
- [Better Auth session management docs](https://better-auth.com/docs/concepts/session-management) — database sessions (not JWT by default), `expiresIn`, `updateAge`, cookie cache
- [Better Auth database schema docs](https://better-auth.com/docs/concepts/database) — `users`, `sessions`, `accounts`, `verification` tables and fields
- [Better Auth CLI docs](https://better-auth.com/docs/concepts/cli) — `npx @better-auth/cli generate`, `--output`, `--config` flags
- [Drizzle + Neon connection docs](https://orm.drizzle.team/docs/connect-neon) — neon-http vs neon-serverless setup, transaction differences
- [Next.js 16 installation docs](https://nextjs.org/docs/app/getting-started/installation) — `create-next-app@latest`, default flags, Node 20+ requirement
- [CVE-2025-29927 advisory](https://github.com/advisories/GHSA-f82v-jwr5-mffw) — middleware bypass, server-side protection requirement

### Secondary (MEDIUM confidence)

- [better-auth/better-auth#4747](https://github.com/better-auth/better-auth/issues/4747) — confirmed neon-http "No transactions support" error with Better Auth; WebSocket driver required
- [drizzle-team/drizzle-orm#5208](https://github.com/drizzle-team/drizzle-orm/issues/5208) — neon-http incompatibility with `@neondatabase/serverless@1.0.0`; `^0.10.4` workaround; issue closed
- WebSearch cross-reference for `auth.api.getSession()` and `auth.api.listUserAccounts()` patterns — verified against official Better Auth docs patterns

### Tertiary (LOW confidence)

- WebSearch result indicating drizzle-orm 0.45.x includes neon-http fix for `@neondatabase/serverless@1.x` — not confirmed against authoritative changelog; do not act on this without further verification (keep `^0.10.4` pin)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all package versions verified against npm registry; official docs consulted for Better Auth, Drizzle, Next.js
- Architecture: HIGH — dual-driver pattern confirmed by official Drizzle docs + Better Auth issue tracker; auth guard pattern confirmed by Better Auth Next.js docs
- Pitfalls: HIGH — pitfalls 1-3 are from official advisories and official issue trackers; pitfalls 4-7 from official docs and repo issues
- Schema: MEDIUM — Better Auth core tables inferred from docs (field names may need adjustment from `npx @better-auth/cli generate` output); app tables are project-specific design

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (Better Auth and Next.js release frequently; check for minor version bumps before executing)
