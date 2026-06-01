---
phase: 01-auth-database-foundation
plan: 02
type: summary
status: complete
completed: 2026-06-01
requirements: [AUTH-01, AUTH-03, AUTH-04]
---

# Plan 01-02 Summary — Email/Password Auth Slice + Protected Dashboard

## Outcome

End-to-end email/password auth vertical slice is live: a user can sign up, sign in,
stay signed in across refresh, view a server-guarded `/dashboard`, and log out. The
auth guard is a **server-side layout check** (NOT middleware — CVE-2025-29927). All
6 behavior tests are GREEN; build + lint clean. GitHub OAuth and the real
GitHub-connected badge are left as clearly-marked Plan 03 extension points.

Satisfies AUTH-01 (register persists), AUTH-03 (stay signed in across refresh),
AUTH-04 (logout clears session), plus the protected-route redirect and the
signed-in auth-page bounce.

## Artifacts produced (for downstream plans — use directly)

### `src/lib/auth.ts` — Better Auth server instance
- Export: `auth`.
- `database: drizzleAdapter(authDb, { provider: 'pg', schema: authSchema })`.
  **Uses `authDb` (neon-serverless)** — neon-http throws "No transactions support".
- `authSchema` aliases Better Auth's **singular** model names to our **plural**
  schema exports: `{ user: users, session: sessions, account: accounts, verification: verifications }`.
  Required because the Drizzle adapter resolves models via `schema[modelName]`
  with singular keys; our shared schema keeps plural export names for app code.
- `emailAndPassword: { enabled: true, minPasswordLength: 8 }` (D-11). No custom
  complexity rules.
- `plugins: [nextCookies()]`. **No cookie cache** (avoids RSC null bug #7008).
- **Plan 03 extension point:** commented `socialProviders.github` block — do NOT
  add GitHub OAuth before Plan 03 (AUTH-02).

### `src/lib/auth-client.ts` — Better Auth browser client
- Export: `authClient` = `createAuthClient({ baseURL: NEXT_PUBLIC_APP_URL ?? localhost })`.
- Client API used here: `authClient.signUp.email({ name, email, password, callbackURL })`,
  `authClient.signIn.email(...)`, `authClient.signOut()`.

### `src/app/api/auth/[...all]/route.ts` — catch-all handler
- `export const { GET, POST } = toNextJsHandler(auth)`. Node runtime (no edge).

### Protected-route pattern (the reusable security boundary)
- `src/app/dashboard/layout.tsx` (server component):
  `const session = await auth.api.getSession({ headers: await headers() })`;
  `if (!session) redirect('/login')`. **This is the auth boundary — replicate this
  layout-level pattern for every future protected route group; never rely on
  middleware** (CVE-2025-29927, D-10).
- Server-side getSession with `await headers()` + no cookie cache ⇒ a signed-in
  refresh resolves a real session and never bounces to `/login`.

### Auth pages (bounce-if-authed wrappers + client forms)
- `(auth)/login/page.tsx`, `(auth)/signup/page.tsx`: server components that
  `getSession` and `redirect('/dashboard')` if already signed in (Pattern 7), then
  render the client form.
- `(auth)/login/login-form.tsx`, `(auth)/signup/signup-form.tsx`: shadcn
  Card/Input/Label/Button/Separator. Validate on submit; inline errors below the
  field (`text-destructive text-sm`); clear field error on type; Loader2 +
  disabled + "Signing in…" / "Creating account…" loading states. Exact UI-SPEC copy.

### Dashboard shell (D-09)
- `src/app/dashboard/page.tsx`: top nav (app name + user email + logout),
  time-of-day greeting ("Good {morning|afternoon|evening}, {firstName}" / "Welcome
  back" when no name), placeholder GitHub badge, and `{children}` (Phase 2 seam).
- `src/components/logout-button.tsx`: client, shadcn `ghost` Button "Log out",
  `authClient.signOut()` → `router.push('/login')`. No confirmation dialog.

### Plan 03 extension points (left as placeholders, NOT wired)
1. **"Continue with GitHub" button** (both forms): rendered `disabled`, above an
   "or" separator, with final markup. Plan 03 only needs to enable it + attach an
   `onClick` calling `authClient.signIn.social({ provider: 'github' })`. Icon is
   `GitBranch` (see deviation 2) — swap to a brand glyph if desired.
2. **GitHub-connected badge** (`dashboard/page.tsx`): currently always renders the
   `outline` "GitHub not connected" badge. Plan 03 swaps in the real check
   (`auth.api.listUserAccounts` / accounts query, RESEARCH Pattern 5) and the
   `secondary` "GitHub connected" badge with `CircleCheck`.

### Tooling / config
- `components.json` — shadcn `radix-nova` preset (lucide icons, Geist font, RSC).
- 6 shadcn components in `src/components/ui/`: button, input, label, card, badge,
  separator. `src/lib/utils.ts` (cn helper).
- `next.config.ts` — `serverExternalPackages: ['better-auth', '@better-auth/kysely-adapter']`.
- `package.json` — pinned `kysely@0.28.17` (devDep) — see deviation 3.

### Tests
- `src/tests/auth.test.ts` — 5 cases: signup persists `user`; duplicate email →
  422 / `USER_ALREADY_EXISTS*`; <8-char password → 400 / `PASSWORD_TOO_SHORT` + no
  row; signIn sets `better-auth` session cookie + getSession non-null; signOut →
  getSession null. Unique emails per run + afterEach cleanup.
- `src/tests/routing.test.ts` — 1 case: unauthenticated `/dashboard` layout guard
  throws `NEXT_REDIRECT` to `/login` (mocks only `next/headers` to provide a
  request scope; real getSession + real redirect run).

## Verification
- `npx vitest run` → 7 tests pass (6 new + Wave 1 db test).
- `npm run build` → exit 0 (all routes: /, /login, /signup, /dashboard, /api/auth/[...all]).
- `npm run lint` → exit 0.
- Grep checks: `minPasswordLength: 8` ✓, `drizzleAdapter(authDb` ✓, no active
  `socialProviders.github` ✓, no `export const runtime = 'edge'` ✓, `getSession`
  + `redirect('/login')` in layout ✓, `components.json` + 6 ui components ✓.

## Deviations from plan

### 1. [Rule 3 — blocking] Drizzle adapter needs explicit singular-keyed schema
- **Found during:** Task 2 (signIn/signOut tests threw `model "user" was not found`).
- **Why:** Better Auth's Drizzle adapter looks up `schema[modelName]` with singular
  keys (`user`, `session`, ...); our schema exports are plural (`users`, ...).
- **Fix:** Pass an explicit `authSchema` alias map (`user: users`, etc.) to the
  adapter rather than renaming the shared schema exports (Wave 1 + app code depend
  on the plural names). Documented inline in `auth.ts`.
- **Commit:** ec6b751.

### 2. [Rule 3 — blocking] `Github` brand icon removed from lucide-react 1.17
- **Found during:** Task 2 build ("Export Github doesn't exist").
- **Why:** lucide-react 1.17.0 dropped brand icons; there is no `Github` export.
- **Fix:** Use `GitBranch` as the placeholder glyph on the (disabled) "Continue with
  GitHub" button. Cosmetic only — Plan 03 may swap it. RESEARCH had assumed a
  `Github` icon for Phase 1.
- **Commit:** ec6b751.

### 3. [Rule 3 — blocking] Pin `kysely@0.28.17` to unblock the build
- **Found during:** Task 2 build (Turbopack: `DEFAULT_MIGRATION_LOCK_TABLE` /
  `DEFAULT_MIGRATION_TABLE` not found in `kysely`).
- **Why:** kysely 0.29.x (the deduped transitive version pulled by better-auth)
  moved those constants off the package root to `kysely/migration` (root now exports
  a type-error stub). `@better-auth/kysely-adapter@1.6.13` still imports them from
  root — a genuine upstream version mismatch. The adapter is only loaded because
  better-auth's init touches it; we use the **Drizzle** adapter, not kysely.
- **Fix:** Pin `kysely@0.28.17` (within the adapter's peer range `^0.28.17 || ^0.29.0`),
  which still re-exports the constants from root (verified `ROOT-EXPORTS-OK`). Also
  added `serverExternalPackages` for better-auth so its server-only adapters aren't
  bundled to the client. Not a new/unknown package — kysely was already in the tree;
  this only constrains its version.
- **Commit:** ec6b751.

### 4. [Rule 3] shadcn 4.x preset replaces the literal "new-york" style selector
- **Found during:** Task 2 shadcn init (no `--style new-york` flag in shadcn 4.10).
- **Why:** shadcn 4.x replaced named styles with presets. Selected the **`radix-nova`**
  preset (Radix base + Lucide + Geist) — the direct successor to new-york and a
  match for the UI-SPEC design system (Geist Sans, lucide-react, RSC).
- **Impact:** `components.json` `style: "radix-nova"` instead of `"new-york"`. UI-SPEC
  typography/color defaults preserved (not overridden).
- **Commit:** ec6b751.

### 5. [Rule 2] Signup `name` derived from email local-part
- **Why:** Better Auth email/password signup requires a `name`; the Phase 1 UI
  (UI-SPEC) collects only email + password. Defaulted `name = email.split('@')[0]`.
  A dedicated name field is a later-phase concern.
- **Commit:** ec6b751.

### Test-contract corrections (recorded, not behavioral deviations)
- The RED tests originally asserted `USER_ALREADY_EXISTS` and a 422 short-password
  status per the research doc. The installed Better Auth 1.6.13 emits
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (422) and `PASSWORD_TOO_SHORT` (**400**).
  Tests + the signup-form error mapping now match the real contract (matching the
  `USER_ALREADY_EXISTS*` family for version resilience). The required *behaviors*
  (reject duplicate with the duplicate-email copy; reject short password with no row)
  are unchanged and satisfied.

## Known Stubs
- **GitHub OAuth button** — disabled placeholder, resolved in Plan 03 (AUTH-02).
- **GitHub-connected badge** — hardcoded "not connected" placeholder, resolved in
  Plan 03. Both are intentional, documented seams; neither blocks the Plan 01-02
  goal (email/password auth slice).

## Notes for Plan 03
- Add `socialProviders.github` to `auth.ts` (D-01 scopes `read:user`, `user:email`)
  at the marked extension point.
- Enable + wire the "Continue with GitHub" button (`authClient.signIn.social`).
- Replace the placeholder dashboard badge with the real connected check.
- Reuse the `dashboard/layout.tsx` server-guard pattern for any new protected routes.

## Self-Check: PASSED
- All 14 created/modified key files exist on disk.
- Both commits found in git history: 495417b (RED), ec6b751 (GREEN).
