# Phase 3: Membership + Invite Links - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 3-Membership + Invite Links
**Areas discussed:** Invite link model, Acceptance flow, Member management UI, Remove-member rules

> The user was presented the four gray areas below and chose **"just go with what
> you think is best."** No area was interactively deep-dived; every selection below
> is Claude's recommended call, grounded in the locked constraints, the existing
> schema, and the Phase 2 patterns. Recorded here so the alternatives are auditable.

---

## Invite link model

| Option | Description | Selected |
|--------|-------------|----------|
| One reusable link per project | Single `invitation` row per project; Regenerate replaces token + resets expiry | ✓ |
| Fresh token per invite | New row per invited person; richer but heavier management | |
| Non-expiring link | Simpler, but `expiresAt` is NOT NULL and links live forever | |

**Choice (Claude):** Reusable single link, **30-day** expiry, regenerate invalidates the old link (D-22, D-23, D-24). Owner-only generation (D-25).
**Notes:** Matches the singular "generate a shareable invite URL" criterion and the team-onboarding mental model; bounded expiry satisfies the NOT NULL column and avoids forever-live links.

---

## Acceptance flow

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit "Join project" confirmation (POST) | Visiting shows a landing; clicking Join performs the membership insert | ✓ |
| Silent auto-join on GET visit | Joins on page load; vulnerable to link prefetch/unfurl side effects | |

**Choice (Claude):** Public `/invite/[token]` route; logged-out → login/signup then return; logged-in → confirmation landing with an explicit Join button; invalid/expired → clean error page; idempotent join → redirect to project (D-26, D-27, D-28, D-29).
**Notes:** Join is a POST Server Action, never a GET side effect. Idempotency enforced via check-then-insert **plus** a new DB unique constraint on `project_member (project_id, user_id)` (23505 treated as "already a member").

---

## Member management UI

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `/dashboard/projects/[id]/members` page | Cohesive people view; keeps detail page free for tickets | ✓ |
| Members section on the project detail page | In-context, but mixes with tickets once Phase 5/6 land | |

**Choice (Claude):** Dedicated members page, guarded by `requireProjectMember`; any member views the roster (name + role badge); owner-only invite/remove controls conditionally rendered AND server-enforced (D-31, D-32).
**Notes:** Owner gating enforced server-side via a new `requireProjectOwner` (D-30), never UI-only.

---

## Remove-member rules

| Option | Description | Selected |
|--------|-------------|----------|
| Owner-only hard delete + confirmation | Deletes the project_member row; immediate access loss via per-request auth | ✓ |
| Soft-delete / disable | Extra state, not needed when auth is checked per request | |
| Allow self-leave | Out of MEM-05 scope (owner-removes-member only) | |

**Choice (Claude):** Owner-only `removeMember` action (guarded by `requireProjectOwner`); hard-deletes the row; owner is unremovable; confirmation dialog; immediate access loss is structural (D-33, D-34).
**Notes:** Membership is never cached in the session JWT, so deleting the row takes effect on the removed user's next request.

---

## Claude's Discretion

- Exact invite-token length/library (UUID vs nanoid vs 32-byte base64url), provided high entropy + URL-safe.
- Regenerate via delete-then-insert vs update-in-place for the single invitation row.
- Login-return mechanism (query param vs Better Auth `callbackURL`) — match Phase 1's auth pages.
- `alert-dialog` vs the installed `dialog` for the remove confirmation.
- Members-page layout (list vs cards), empty/owner-only states, members-link affordance on the detail header.

## Deferred Ideas

- Self-service "leave project" (not in MEM-05).
- Reassigning/clearing a removed member's ticket assignments (Phase 5).
- Per-invite tokens / multiple links / usage analytics / revoke-specific-link (v1 uses one reusable link).
- Email-delivered invitations and 3-tier roles (explicitly v2).
- Owner transfer / changing a member's role (not a Phase 3 requirement).
