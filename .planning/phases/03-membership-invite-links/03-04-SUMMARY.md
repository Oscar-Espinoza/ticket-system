---
phase: 03-membership-invite-links
plan: "04"
subsystem: membership
tags: [server-action, ui-component, authorization, hard-delete, alert-dialog]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [removeMember-action, MemberList-component, alert-dialog-primitive]
  affects: [src/app/dashboard/projects/[id]/members/page.tsx]
tech_stack:
  added: [shadcn alert-dialog (@radix-ui/react-alert-dialog via shadcn)]
  patterns: [owner-only-guard, hard-delete, useTransition-pending, AlertDialog-confirm, formdata-server-action]
key_files:
  created:
    - src/components/ui/alert-dialog.tsx
    - src/app/actions/members.ts
    - src/components/member-list.tsx
  modified:
    - src/app/dashboard/projects/[id]/members/page.tsx
decisions:
  - "removeMember uses FormData (useActionState signature) matching wave-0 RED tests — formData.get('memberId') is the project_member row id, not userId"
  - "MemberList receives id + userId + name + role per member; id needed for FormData memberId in removeMember"
  - "members/page.tsx roster SELECT extended to include id: projectMembers.id for MemberList prop"
  - "Per-row MemberRow sub-component owns its own useTransition + error state (avoids shared state across rows)"
metrics:
  duration: "~4m"
  completed: "2026-06-01"
  tasks_total: 3
  tasks_completed: 3
  files_total: 4
---

# Phase 03 Plan 04: Remove Member (MEM-05) Summary

Owner removes a project member via AlertDialog-confirmed Remove button; `removeMember` Server Action hard-deletes the member row with owner/self-remove guards and immediate access revocation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install shadcn alert-dialog primitive | a5ab51a | src/components/ui/alert-dialog.tsx |
| 2 | removeMember owner-only Server Action | f1fd634 | src/app/actions/members.ts |
| 3 | MemberList component + members page wiring | ac19ff0 | src/components/member-list.tsx, members/page.tsx |

## What Was Built

**alert-dialog primitive** — installed via `npx shadcn@latest add alert-dialog` from the official shadcn registry. Exports AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction (radix-nova preset, cssVariables).

**removeMember Server Action** (`src/app/actions/members.ts`) — `'use server'` file with `RemoveMemberState` type and `removeMember(prevState, formData)` export. Guards in order: (1) session authentication, (2) `requireProjectOwner` → Forbidden on ProjectAccessError, (3) self-remove rejection, (4) owner-row protection. Hard-deletes by `projectMembers.id` (scoped WHERE prevents IDOR), then `revalidatePath`. No `db.transaction` (neon-http).

**MemberList client component** (`src/components/member-list.tsx`) — `'use client'` component rendering member Cards with role badges. Owner sees Remove buttons on non-owner, non-self rows. Each `MemberRow` sub-component owns `useTransition` + `error` state. AlertDialog confirm → `handleRemove` → FormData → `removeMember`. Inline error on failure.

**members/page.tsx** — roster SELECT extended with `id: projectMembers.id`. Inline roster replaced with `<MemberList members={roster} isOwner={membership.role === 'owner'} currentUserId={session.user.id} projectId={id} />`. InvitePanel + Separator preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] removeMember signature matches wave-0 RED test spec**

- **Found during:** Task 2
- **Issue:** Plan described `removeMember(projectId: string, memberUserId: string)` as a direct call, but the wave-0 RED tests (authored in Plan 01) call it as `removeMember(prevState, formData)` using `formData.set('memberId', memberRowId)` (the project_member row id, not userId). The tests are the authoritative spec.
- **Fix:** Implemented as `removeMember(_prevState: RemoveMemberState, formData: FormData)`. Reads `projectId` and `memberId` from FormData. Owner/self-remove checks load the target row by `projectMembers.id` (the row id), verifying role and userId before deleting. The MemberList component creates FormData and calls the action directly (no `form` element needed).
- **Files modified:** src/app/actions/members.ts, src/components/member-list.tsx
- **Commits:** f1fd634, ac19ff0

**2. [Rule 2 - Missing functionality] roster SELECT extended with id column**

- **Found during:** Task 3
- **Issue:** Plan 02's roster SELECT returned `{ userId, name, role }` but MemberList needs the member row `id` to populate FormData for `removeMember`.
- **Fix:** Added `id: projectMembers.id` to the roster SELECT in members/page.tsx and updated MemberList props to include `id`.
- **Files modified:** src/app/dashboard/projects/[id]/members/page.tsx
- **Commit:** ac19ff0

## Verification

- `npx vitest run src/tests/membership.test.ts -t removeMember` — 3/3 GREEN (delete, owner-protected, self-remove rejected)
- `npx vitest run src/tests/membership.test.ts` — 12/12 GREEN (full phase suite)
- `npx tsc --noEmit` — clean (0 errors)

## Known Stubs

None — removeMember is fully wired end-to-end.

## Threat Flags

No new threat surface beyond the threat model in 03-04-PLAN.md. All four STRIDE threats (T-03-12 through T-03-15 + T-03-SC) are mitigated as designed.

## Self-Check: PASSED

Files created/modified:
- FOUND: src/components/ui/alert-dialog.tsx
- FOUND: src/app/actions/members.ts
- FOUND: src/components/member-list.tsx
- FOUND: src/app/dashboard/projects/[id]/members/page.tsx

Commits:
- FOUND: a5ab51a (chore(03-04): install shadcn alert-dialog primitive)
- FOUND: f1fd634 (feat(03-04): removeMember owner-only Server Action)
- FOUND: ac19ff0 (feat(03-04): MemberList client component + members page wiring)
