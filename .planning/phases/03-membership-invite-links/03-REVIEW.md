---
phase: 03-membership-invite-links
reviewed: 2026-06-01T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/app/actions/invite.ts
  - src/app/actions/join.ts
  - src/app/actions/members.ts
  - src/app/dashboard/projects/[id]/members/page.tsx
  - src/app/dashboard/projects/[id]/page.tsx
  - src/app/invite/[token]/page.tsx
  - src/components/invite-panel.tsx
  - src/components/join-project-button.tsx
  - src/components/member-list.tsx
  - src/components/ui/alert-dialog.tsx
  - src/db/schema.ts
  - src/lib/project-access.ts
  - src/tests/membership.test.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The membership and invite-links slice is generally well-constructed: authorization runs before any project-scoped DB read in every page and action, the `requireProjectMember` / `requireProjectOwner` seam is centralized and defends against falsy ids, `removeMember` is IDOR-scoped, idempotent join logic has both a check and a 23505 backstop, and the invite token has 256 bits of entropy. The threat-model annotations are accurate where I could verify them.

However, the logged-out invite flow is broken end-to-end: the invite page sends visitors to `/login?redirect=/invite/<token>`, but neither the login nor signup page reads that `redirect` param — they hard-code `/dashboard`. A logged-out person who clicks an invite link can never reach the join screen. That is a BLOCKER for the phase's core user story.

Secondary concerns center on the `NEXT_PUBLIC_APP_URL` env var producing `undefined/invite/...` URLs when unset, no cleanup/uniqueness story for stale invitation rows across projects, and an `<a>`-only `redirect` value being an unvalidated open-redirect sink once the param IS wired up.

## Critical Issues

### CR-01: Logged-out invite flow is broken — `redirect` param is never honored by login/signup

**File:** `src/app/invite/[token]/page.tsx:116` (sink), `src/app/(auth)/login/page.tsx:11-19` + `src/app/(auth)/login/login-form.tsx:90` (drop point)
**Issue:** State B of the invite page renders a CTA linking to `/login?redirect=/invite/${token}` so a logged-out invitee returns to the invite after signing in (the file's own D-26 contract: "logged-out visitor redirects to /login?redirect=/invite/[token] after auth"). But `LoginPage` ignores `searchParams` entirely, and `LoginForm.handleSubmit` calls `authClient.signIn.email({ ..., callbackURL: '/dashboard' })` then `router.push('/dashboard')`. The GitHub OAuth path also hard-codes `callbackURL: '/dashboard'`. The signup page has the identical defect. Net effect: a logged-out user who clicks an invite link signs in, lands on `/dashboard`, and is never taken to the join screen — the project they were invited to is not even visible to them in the dashboard (they are not yet a member). The phase's primary "invite by shareable link" story does not work for unauthenticated recipients.
**Fix:** Read and propagate the `redirect` param. In `LoginPage`/`SignupPage`:
```tsx
export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect: redirectTo } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(safeRedirect(redirectTo) ?? '/dashboard');
  return (/* ... */ <LoginForm redirectTo={safeRedirect(redirectTo)} /> /* ... */);
}
```
Then in the form use `callbackURL: redirectTo ?? '/dashboard'` and `router.push(redirectTo ?? '/dashboard')`. See WR-05 for the `safeRedirect` validation that MUST accompany this — do not push a raw query param into a redirect.

## Warnings

### WR-01: `NEXT_PUBLIC_APP_URL` unset produces `undefined/invite/<token>` invite URLs

**File:** `src/app/actions/invite.ts:93`, `src/app/dashboard/projects/[id]/members/page.tsx:84`
**Issue:** Both call sites interpolate `process.env.NEXT_PUBLIC_APP_URL` with no fallback. If the env var is missing (it is not referenced in the schema/`db.ts` and `auth-client.ts` notably *does* provide a `?? 'http://localhost:3000'` fallback, implying it can be absent), `generateInviteLink` returns and the members page renders an invite URL of the literal form `undefined/invite/AbC...`. Owners copy-paste a dead link. Silent data corruption of the feature's one user-facing artifact.
**Fix:** Centralize a validated base URL helper and fail loud at startup if absent, or at minimum mirror the auth-client fallback:
```ts
const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
// ...
url: `${base}/invite/${token}`,
```
Prefer a single `getAppUrl()` in `src/lib/` so the action and the page cannot drift.

### WR-02: Invitation token uniqueness is global, but generate scopes the delete per-project — cross-project token collision is unhandled at the right layer

**File:** `src/app/actions/invite.ts:73-87`, `src/db/schema.ts:120-128`
**Issue:** `invitations.token` is `.unique()` globally (good), and the batch does `DELETE WHERE projectId = ?` then `INSERT`. The 23505 mapping at lines 80-85 is the only guard against an insert colliding with *another project's* still-live token. With 256-bit tokens that is astronomically unlikely, so the real issue is the opposite: the per-project delete leaves **stale expired invitation rows for OTHER projects** accumulating forever — nothing ever deletes an expired invitation except a regenerate on that same project. Over time the `invitation` table grows unbounded with dead rows on the free Neon tier (512 MB). Not a correctness blocker, but a maintainability/operational defect with no cleanup path defined in this phase.
**Fix:** Either (a) add a comment + follow-up ticket acknowledging expired-row accumulation is deferred, or (b) opportunistically `DELETE FROM invitation WHERE expiresAt < now()` inside the same batch. Document the decision so it is not silently lost.

### WR-03: `joinProject` re-resolves the token but never re-checks the project still exists / membership cap — over-trusts cascade

**File:** `src/app/actions/join.ts:49-65`
**Issue:** The invitation lookup selects only `projectId` filtered by `token` + `expiresAt > now`. If the parent project row was deleted, the FK `onDelete: 'cascade'` (schema line 124) removes the invitation too, so `invitation` would be null — that path is fine. But the action then inserts a `projectMembers` row using `projectId` from the invitation with no further validation, and on the already-member path (`existing` truthy) it redirects the user to `/dashboard/projects/${projectId}` even if that user's row is a leftover from a project they were removed from but re-joined-stale-token scenario. More concretely: there is no guard that the resolved `projectId` is still a row in `projects` at insert time — a race where the project is deleted between the invitation SELECT and the member INSERT would surface as a raw FK violation (23503), which is *not* in the 23505 mapping and would be re-thrown as an unhandled 500 to the user instead of a clean "invalid" message.
**Fix:** Map FK-violation `23503` to the same `{ error: 'invalid' }` clean path, since a vanished project is functionally an invalid invite:
```ts
if (code === '23505') { /* already member */ }
else if (code === '23503') { return { error: 'invalid' }; }
else { throw err; }
```
Note: the function signature returns `JoinProjectState`, but the success paths all `redirect()` (throw NEXT_REDIRECT), so returning `{ error: 'invalid' }` here is the only reachable non-throw return and is consistent with the existing early returns.

### WR-04: `removeMember` is invoked client-side with `{}` cast as `RemoveMemberState` — prevState contract is unenforced

**File:** `src/components/member-list.tsx:111`, `src/app/actions/members.ts:34-37`
**Issue:** `MemberList` calls `removeMember({}, formData)` passing a bare `{}` as `_prevState`. The action ignores `_prevState` (underscore-prefixed), so this is harmless today. But `removeMember` is a `'use server'` action exported and callable from any client; passing `{}` where `RemoveMemberState` is expected only type-checks because `RemoveMemberState` has all-optional fields. If a future edit makes `_prevState` load-bearing, this call site silently passes empty state with no compile error. Minor, but it is an unenforced contract on a security-sensitive action.
**Fix:** Either bind via `useActionState(removeMember, {})` like the other actions (consistent pattern, gives pending state for free and removes the manual `startTransition`), or type the literal: `removeMember({} as RemoveMemberState, formData)` is already what's happening implicitly — prefer `useActionState` for consistency with `InvitePanel`/`JoinProjectButton`.

### WR-05: Once `redirect` is wired (CR-01), the raw param is an open-redirect sink

**File:** `src/app/invite/[token]/page.tsx:116` (produces it), future login/signup consumers
**Issue:** Fixing CR-01 by passing the `redirect` query param straight into `router.push()` / `callbackURL` / server `redirect()` creates an open-redirect: an attacker crafts `/login?redirect=https://evil.example/phish` and the post-login navigation sends the authenticated user off-site (or to `//evil.example`, or `/\evil.example`). This is the classic pairing with CR-01 — flagging now so the fix does not introduce the vuln.
**Fix:** Validate the redirect target is a same-origin app path before honoring it:
```ts
function safeRedirect(target?: string): string | undefined {
  if (!target) return undefined;
  // must be a root-relative path, not protocol-relative or absolute URL
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return undefined;
  return target;
}
```
Apply in both login and signup before any navigation.

## Info

### IN-01: `removeMember` self/owner guards run AFTER a SELECT that could be folded, but the comment already justifies it

**File:** `src/app/actions/members.ts:62-99`
**Issue:** The acknowledged separate SELECT-then-DELETE is defensible (the inline comment explains neon-http `rowsAffected` unreliability and the need for distinct error messages). No change required, but note the target-row SELECT and the DELETE WHERE clause are identical (`id` + `projectId`) — a concurrent delete between the two could make the DELETE a no-op while the action still returns `success: true`. Functionally fine (the row is gone either way), just noting the success message is not strictly "this call deleted it."
**Fix:** None required; optionally note the benign race in the comment.

### IN-02: Token entropy comment says base64url(32 bytes) = 43 chars — correct, but token length is never asserted in tests

**File:** `src/app/actions/invite.ts:62-64`, `src/tests/membership.test.ts:324-326`
**Issue:** The test only asserts `token.length > 0`, not the expected 43-char URL-safe shape. A regression that swapped `randomBytes(32)` for a weaker generator (e.g. `Math.random`) would still pass. Low risk given the code is correct now.
**Fix:** Tighten the assertion: `expect(invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);`

### IN-03: `InvitePanel` clipboard fallback selects the input but does not `execCommand('copy')` — fallback does not actually copy

**File:** `src/components/invite-panel.tsx:46-56`
**Issue:** When `navigator.clipboard.writeText` throws (insecure context / older browser), the catch only calls `inputRef.current?.select()` and then still sets `copied = true`, showing "Copied!" even though nothing was copied — the text is merely selected. The success label is misleading on the fallback path.
**Fix:** Either drop the "Copied!" feedback on the catch branch, or perform the legacy copy: after `select()`, the user must still Ctrl+C, so show a different hint (e.g. "Press Ctrl+C") rather than "Copied!".

### IN-04: Membership tests cover happy/forbidden paths but not the expired-token join path (D-24/D-28)

**File:** `src/tests/membership.test.ts:411-521`
**Issue:** D-28 ("unknown/expired token → { error: 'invalid' }, no project info leaked") is a stated security contract of `joinProject`, but no test exercises an expired or unknown token against `joinProject` — only fresh-join and already-member are covered. The expired-filter (`gt(expiresAt, now)`) is therefore unverified.
**Fix:** Add a test inserting an invitation with `expiresAt` in the past and assert `joinProject` returns `{ error: 'invalid' }` and inserts no `projectMembers` row.

---

_Reviewed: 2026-06-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
