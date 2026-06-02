---
phase: 03-membership-invite-links
plan: "02"
subsystem: membership-invite
tags: [server-action, client-component, authorization, invite-links, roster]
dependency_graph:
  requires: [03-01]
  provides: [generateInviteLink-action, InvitePanel-component, members-page, detail-header-members-link]
  affects: [03-03, 03-04]
tech_stack:
  added: []
  patterns: [useActionState, db.batch delete-then-insert, requireProjectOwner-guard, 403-before-DB, randomBytes-base64url]
key_files:
  created:
    - src/app/actions/invite.ts
    - src/app/dashboard/projects/[id]/members/page.tsx
    - src/components/invite-panel.tsx
  modified:
    - src/app/dashboard/projects/[id]/page.tsx
decisions:
  - "Roster SELECT explicitly selects userId column so Plan 04 Task 3 can wire removeMember(projectId, row.userId) without tsc errors"
  - "InvitePanel displays state.url (post-submit) OR inviteUrl prop (initial render) to handle in-flight regenerate without full page wait"
  - "db.transaction mention in invite.ts comment matched grep warning but is comments-only; actual code only uses db.batch"
metrics:
  duration: ~15m
  completed: "2026-06-02"
  tasks_completed: 3
  files_changed: 4
---

# Phase 03 Plan 02: Invite Link Generation + Members Page Summary

**One-liner:** Owner-only generateInviteLink Server Action (randomBytes/base64url, 30-day expiry, delete-then-insert db.batch) + members page with roster (userId/name/role) + InvitePanel client component (useActionState, clipboard copy, Loader2 pending state).

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | generateInviteLink Server Action (MEM-01) | 84b901d | src/app/actions/invite.ts |
| 2 | Members page + roster + detail header link (MEM-04) | b9e982a | src/app/dashboard/projects/[id]/members/page.tsx, src/app/dashboard/projects/[id]/page.tsx |
| 3 | InvitePanel client component (MEM-01) | 2bc0930 | src/components/invite-panel.tsx |

## What Was Built

### Task 1: generateInviteLink Server Action
- `src/app/actions/invite.ts` — exports `GenerateInviteState` type and `generateInviteLink` action
- Session resolution via `auth.api.getSession({ headers: await headers() })`
- `requireProjectOwner` guard runs before any DB write (T-03-04 mitigation)
- Token: `randomBytes(32).toString('base64url')` — 256-bit entropy, URL-safe (D-23)
- Expiry: `new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)` — 30 days (D-24)
- `db.batch([delete, insert])` enforces one active invitation row per project (D-22)
- Returns `{ success: true, url: NEXT_PUBLIC_APP_URL/invite/token }` on success
- `revalidatePath('/dashboard/projects/${projectId}/members')` triggers fresh render

### Task 2: Members Page + Detail Header Link
- `src/app/dashboard/projects/[id]/members/page.tsx` — async server component
- `requireProjectMember` runs before any project/roster SELECT (T-03-06 mitigation)
- Roster SELECT: `select({ userId: projectMembers.userId, name: users.name, role: projectMembers.role })` with `innerJoin(users, eq(projectMembers.userId, users.id))` — `userId` required for Plan 04 `removeMember` wiring
- Existing invitation loaded for `existingUrl` prop passed to InvitePanel
- Invite panel + Separator rendered only when `membership.role === 'owner'` (D-25)
- `src/app/dashboard/projects/[id]/page.tsx` — header modified to wrap email span and new Members Link in `<div className="flex items-center gap-4">` maintaining `justify-between`

### Task 3: InvitePanel Client Component
- `src/components/invite-panel.tsx` — `'use client'` with `useActionState(generateInviteLink, {})`
- When `displayUrl` present: read-only Input with `ref={inputRef}`, Copy button, Regenerate submit
- Copy: `navigator.clipboard.writeText(displayUrl)` with `inputRef.current?.select()` fallback, "Copied!" for 2000ms
- When `displayUrl` null: primary "Generate invite link" submit button
- `displayUrl = state.url ?? inviteUrl` — prefer freshly generated URL over stale prop
- Loader2 spinner on Regenerate/Generate while `isPending`
- Server error displayed as `text-destructive` paragraph

## Verification

### Tests
- `npx vitest run src/tests/membership.test.ts -t generateInviteLink` — 3/3 passed:
  - Inserts exactly one invitation row with unique token and ~30-day expiry
  - Regenerate replaces token (still exactly one row)
  - Non-owner member returns Forbidden error

### TypeScript
- `npx tsc --noEmit` — zero errors in files created/modified by this plan
- Pre-existing tsc errors from test file RED stubs (`@/app/actions/join`, `@/app/actions/members`) are from Plans 03 and 04 respectively — out of scope for this plan

## Deviations from Plan

None — plan executed exactly as written. The verification script used `! grep -q "db.transaction"` but the match was a comment-only occurrence explaining the batch approach; the actual code uses only `db.batch`.

## Threat Surface Scan

No new network endpoints or auth paths introduced. All security boundaries follow plan:
- `generateInviteLink`: `requireProjectOwner` before any write (T-03-04)
- `members/page.tsx`: `requireProjectMember` before any SELECT (T-03-06)
- Token stored as randomBytes(32).base64url — unguessable capability URL (T-03-05)
- Regenerate replaces the single invitation row, invalidating old token (T-03-07)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/app/actions/invite.ts | FOUND |
| src/app/dashboard/projects/[id]/members/page.tsx | FOUND |
| src/components/invite-panel.tsx | FOUND |
| .planning/phases/03-membership-invite-links/03-02-SUMMARY.md | FOUND |
| commit 84b901d (invite.ts) | FOUND |
| commit b9e982a (members/page.tsx + page.tsx) | FOUND |
| commit 2bc0930 (invite-panel.tsx) | FOUND |
