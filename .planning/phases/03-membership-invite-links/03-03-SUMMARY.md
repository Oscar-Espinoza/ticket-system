---
phase: 03-membership-invite-links
plan: "03"
subsystem: membership-invite-accept
tags: [server-action, idempotent-join, invite-landing, client-component, post-only]
dependency_graph:
  requires: [03-01]
  provides: [joinProject-action, invite-landing-page, join-project-button]
  affects: [src/app/invite, src/app/actions/join.ts, src/components/join-project-button.tsx]
tech_stack:
  added: []
  patterns:
    - "Server Action with redirect() outside try/catch (NEXT_REDIRECT must not be swallowed)"
    - "Check-then-insert + 23505 backstop for race-safe idempotent membership"
    - "Public route rendering three states without forcing session redirect"
    - "Form POST via useActionState — Server Action owns navigation via redirect()"
key_files:
  created:
    - src/app/actions/join.ts
    - src/app/invite/[token]/page.tsx
    - src/components/join-project-button.tsx
  modified: []
decisions:
  - "redirect() called OUTSIDE the DB try/catch block — redirect() throws NEXT_REDIRECT which catch would swallow"
  - "Invalid tokens return 200 + generic message (never Next.js notFound) to avoid confirming token existence (D-28)"
  - "All three success paths (fresh join, already-member, 23505 race) redirect to the project — no return value for client to navigate with"
metrics:
  duration: "~4m"
  completed: "2026-06-02T03:48:50Z"
  tasks: 3
  files: 3
---

# Phase 03 Plan 03: Invite Acceptance Slice Summary

## One-liner

Public `/invite/[token]` landing + idempotent `joinProject` Server Action with check-then-insert and 23505 backstop routing all success paths to redirect to the project.

## What Was Built

### Task 1 — `joinProject` idempotent Server Action (MEM-02)

Created `src/app/actions/join.ts` implementing the full acceptance flow:

- Validates session (no session → `{ error: 'Not authenticated' }`, no redirect).
- Resolves the invitation by `token AND expiresAt > now` — expired or unknown tokens return `{ error: 'invalid' }` and never insert (D-24, D-28).
- App-level idempotency: checks `project_member` for `(projectId, userId)` before insert; if a row exists, skips insert and falls through to redirect.
- Inserts a new `project_member` row with `role: 'member'` for new joiners.
- Maps SQLSTATE 23505 (concurrent double-submit) to the already-a-member path (D-29 race-safe backstop); re-throws all other DB errors.
- Calls `revalidatePath` then `redirect()` OUTSIDE the DB try/catch block so `NEXT_REDIRECT` is never swallowed by the catch clause.
- Tests (2 vitest tests in `membership.test.ts`) verified GREEN after implementation.

### Task 2 — Public invite landing page (`/invite/[token]`)

Created `src/app/invite/[token]/page.tsx` — an async server component outside `/dashboard`:

- **State A** (valid token + logged-in): shows `<JoinProjectButton>` with "Join {projectName}" heading (UI-SPEC exact copy).
- **State B** (valid token + logged-out): shows sign-in CTA with `href="/login?redirect=/invite/${token}"` (return-to-invite wired, D-26).
- **State C** (invalid/expired): returns 200 with "Invalid invite link" + body. Never calls Next.js 404 helper (D-28 enumeration-resistance).
- No `DashboardLayout`, no forced session redirect — page handles auth state internally.
- Session resolved with `auth.api.getSession` that may return null.

### Task 3 — `JoinProjectButton` client component

Created `src/components/join-project-button.tsx`:

- `'use client'` component accepting `{ token: string }`.
- `useActionState(joinProject, {})` drives form submission (explicit POST, never on render, D-27).
- Hidden `<input type="hidden" name="token" value={token} />` passes token to action.
- Loader2 spinner while `isPending`; "Join project" label when idle.
- No `useRouter`, `router.push`, or `useEffect` — the Server Action's `redirect()` owns navigation.
- Inline error message when `state.error` is set (expired link after page load scenario).

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes

**Grep false-positive in verification command:** The plan's Task 2 verification used `! grep -q "notFound()" ...` to confirm the helper is not called. The original file comments included the literal string `notFound()` in explanatory text (explaining why it should NOT be used). The comments were reworded to remove the literal match while preserving the explanation — the actual code never imports or calls `notFound()`.

## Threat Mitigations Implemented

| Threat ID | Status | Implementation |
|-----------|--------|----------------|
| T-03-08 (auto-join on GET) | Mitigated | `joinProject` is a Server Action (POST only); GET on `/invite/[token]` only renders the landing |
| T-03-09 (info disclosure on invalid token) | Mitigated | Returns 200 + generic message; Next.js 404 helper intentionally avoided (D-28) |
| T-03-10 (duplicate membership under concurrent join) | Mitigated | Check-then-insert + 23505 backstop on `unique(project_id, user_id)` constraint (D-29) |
| T-03-11 (expired link reuse) | Mitigated | Invitation lookup filters `expiresAt > now`; expired tokens yield `{ error: 'invalid' }` |

## Known Stubs

None — all render states are wired with real data. No hardcoded placeholders.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries beyond what the plan's threat model covers.

## Verification Results

- `npx vitest run src/tests/membership.test.ts -t "joinProject"` — 2 passed, 10 skipped (other plans' RED tests)
- `npx tsc --noEmit` — clean for all plan-03 files (pre-existing errors in membership.test.ts reference Plans 02 and 04 modules not yet shipped)

## Self-Check: PASSED

- `src/app/actions/join.ts` — exists and contains `joinProject` export
- `src/app/invite/[token]/page.tsx` — exists, no `notFound()` call, has all three render states
- `src/components/join-project-button.tsx` — exists, uses `useActionState`, no `useRouter`/`router.push`
- Commits: da8f1d2 (Task 1), aa03f29 (Task 2), c2db58b (Task 3)
