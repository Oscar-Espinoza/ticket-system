# B9 — Roles beyond owner/member (admin, guest)

## Goal
Four project roles — owner, admin, member, guest — editable in Members
settings, enforced server-side.

## Rules (server = client)
| Actor | Can set roles | On rows | Remove |
|---|---|---|---|
| owner | admin / member / guest | anyone but self | anyone but self |
| admin | member / guest | member / guest rows | member / guest rows |
| member, guest | — | — | — |
Nobody changes the owner row; ownership moves only via **Transfer ownership**
(owner only, AlertDialog confirm): target → owner, old owner → admin,
`project.ownerId` updated, one `db.batch`.
Guest = read + comment (already in `roleAllows`).

## UX
`MemberList` rows: avatar + name (→ `/dashboard/people/[userId]`), email,
role `Select` when the viewer may change it (else a chip), `…` menu with
Transfer ownership / Remove. Admins also get the invite panel.

## Data / actions — `src/app/actions/members.ts`
`removeMember(prev, formData)` (signature kept; admin-aware),
`updateMemberRole({projectId, memberId, role})`,
`transferOwnership({projectId, memberId})`. Role rules live in
`src/components/workspaces/role-rules.ts` (client-safe, shared by UI and
actions). Emits project-level activity (`ticketId: null`):
`member.role_changed`, `member.removed`, `project.ownership_transferred`
with `data.summary`.

## Client helper
`useProjectPermissions()` in `src/components/workspaces/permissions.ts` →
`{role, isOwner, isAdmin, canWrite, canComment, canManageMembers,
assignableRoles(targetRole), canRemove(targetRole)}` from
`useProjectData().project.role`.

## Edge cases
Self role change / self removal rejected. Target row in another project →
"Member not found." Transfer to self → error.
