---
phase: 01-auth-database-foundation
plan: 03
type: summary
status: complete
completed: 2026-06-01
---

# Plan 01-03 Summary — GitHub OAuth Slice (AUTH-02)

## Outcome

GitHub OAuth sign-in wired on top of the email/password auth from Plan 02 with **minimal scopes** (`read:user`, `user:email`). The "Continue with GitHub" buttons are functional, the dashboard renders a real GitHub-connected badge derived from the `account` table, and `getGitHubToken()` is the single token-read seam for Phase 7. Manual OAuth smoke test **passed** (user-confirmed: login worked, landed on dashboard with connected badge).

## Artifacts produced

### `src/lib/auth.ts` (extended)
- Added `socialProviders.github` with `clientId`/`clientSecret` from env and `scope: ['read:user', 'user:email']` (D-01 — minimal; no `repo`/`admin:repo_hook`, deferred to Phase 7 per D-02).

### `src/lib/github-token.ts` (new — the token seam)
- `getGitHubToken(userId)` — server-only; selects `account.accessToken` where `userId` matches AND `providerId === 'github'`; returns the token or `null`. **The ONLY place `accessToken` is read** (D-04) — marked as the future AES-256-GCM encryption seam.
- `isGitHubConnected(userId)` — boolean helper that selects only `account.id` (never the token), used by the dashboard. Resolves Open-Question-1 via the direct-account-query fallback (plan-permitted A2 path).

### UI
- `login-form.tsx` / `signup-form.tsx` — "Continue with GitHub" button enabled, `onClick` → `authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard' })`; OAuth-failure copy per UI-SPEC.
- `dashboard/page.tsx` — real badge: connected → `secondary` + CheckCircle "GitHub connected"; else `outline` + CircleOff "GitHub not connected". Token never reaches page/session (D-05).

### Test
- `src/tests/github-account.test.ts` — 2 cases (token present → string + connected true; absent → null + false). Passes.

## Verification
- `npx vitest run` → **9/9 pass** (no regressions).
- `npm run build` + `npm run lint` → exit 0.
- Scope guard: `read:user` present; no `repo`/`admin:repo_hook` anywhere in auth.ts.
- `grep -rln "accessToken" src/lib src/app` → only `src/lib/github-token.ts`.
- **Manual smoke test (Task 2, blocking):** PASSED — GitHub login completed and landed on dashboard with connected badge (user-confirmed 2026-06-01).

## Deviations from plan
- **Dropped `server-only` import** in github-token.ts (not installed; would have needed a new package). Server-only guarantee preserved by construction (imports neon-http `db`); documented in header.
- **Added `isGitHubConnected()` helper** alongside `getGitHubToken` so the dashboard has a boolean path that never selects the token (keeps getGitHubToken the sole accessToken reader).
- **Comment phrasing in auth.ts** avoids the literal `repo`/`admin:repo_hook` strings so the D-01/D-02 grep guard is unambiguous. Scope unchanged.

## Notes for Phase 7
- Extend `getGitHubToken()` with AES-256-GCM decryption and add the "Connect GitHub" elevated-scope flow (`repo`, `admin:repo_hook`) — the accessor seam is already isolated here.
