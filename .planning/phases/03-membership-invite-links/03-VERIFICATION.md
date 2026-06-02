---
phase: 03-membership-invite-links
verified: 2026-06-01T21:05:00Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A person visiting the invite URL AFTER SIGNING IN is added as a member of the project (SC#2 second path)"
    status: partial
    reason: "The invite landing page (State B) links logged-out visitors to /login?redirect=/invite/<token>, but neither the login page/form nor the signup page/form reads the `redirect` query param. Both hard-code callbackURL '/dashboard' (email + GitHub OAuth) and router.push('/dashboard'), and the server pages unconditionally redirect('/dashboard') for existing sessions. The `redirect` param has NO consumer anywhere in the codebase (no middleware, no auth-client handling). A logged-out invitee who clicks the link signs in, lands on /dashboard, and is never returned to the join screen — they are not a member and the project is invisible to them. The logged-IN half of SC#2 works fully; the after-signing-in half is broken end-to-end."
    artifacts:
      - path: "src/app/(auth)/login/page.tsx"
        issue: "LoginPage takes no searchParams; unconditionally redirect('/dashboard') for sessions; renders <LoginForm/> with no redirectTo prop"
      - path: "src/app/(auth)/login/login-form.tsx"
        issue: "handleSubmit uses callbackURL:'/dashboard' + router.push('/dashboard'); handleGitHubSignIn uses callbackURL:'/dashboard'. `redirect` param never read."
      - path: "src/app/(auth)/signup/page.tsx"
        issue: "Identical defect — no searchParams, unconditional redirect('/dashboard')"
      - path: "src/app/(auth)/signup/signup-form.tsx"
        issue: "Identical defect — callbackURL:'/dashboard' (line 58, 85) + router.push('/dashboard') (line 103)"
      - path: "src/app/invite/[token]/page.tsx"
        issue: "Line 116 emits /login?redirect=/invite/${token} but the param is dead on arrival"
    missing:
      - "LoginPage/SignupPage must read `searchParams.redirect`, validate it (same-origin root-relative path only — see WR-05 open-redirect), pass to form as redirectTo, and use it in the existing-session redirect()"
      - "LoginForm/SignupForm must accept redirectTo and use it for callbackURL (email + GitHub OAuth) and router.push, falling back to '/dashboard'"
      - "A safeRedirect() validator in src/lib/ to prevent open-redirect when the param IS honored (CR-01 fix must not introduce WR-05 vuln)"
human_verification:
  - test: "End-to-end logged-IN invite flow: while signed in, open an invite URL, click Join, confirm landing on the project and a member row appears in the roster"
    expected: "User is added as a 'member' and redirected to /dashboard/projects/<id>; roster shows them with a Member badge"
    why_human: "Requires a running app + live Neon DB + real session; data-flow is verified statically but end-to-end render/redirect cannot be confirmed by grep"
  - test: "Invite URL correctness with NEXT_PUBLIC_APP_URL set vs unset (WR-01)"
    expected: "Copied URL is a valid absolute https URL, never 'undefined/invite/<token>'"
    why_human: "Depends on deployment env var configuration not present in the repo"
  - test: "Remove member then have that member attempt to access the project (SC#5 immediate access loss)"
    expected: "Removed member gets 404/notFound on the project page on their next request"
    why_human: "Structural guarantee verified in code (per-request requireProjectMember), but live cross-session behavior needs runtime confirmation"
---

# Phase 3: Membership + Invite Links Verification Report

**Phase Goal:** Project owners can invite collaborators via a copy-paste link; invited users can join and be managed.
**Verified:** 2026-06-01T21:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner can generate a shareable invite URL and copy it without sending email | ✓ VERIFIED | `generateInviteLink` (invite.ts) owner-guarded via `requireProjectOwner`, 256-bit base64url token, db.batch delete-then-insert (one row/project), returns `${NEXT_PUBLIC_APP_URL}/invite/${token}`. `InvitePanel` renders read-only URL + Copy (navigator.clipboard.writeText) + Regenerate via useActionState. Test "generateInviteLink" passes. Caveat WR-01: URL is `undefined/...` if env var unset. |
| 2 | A person visiting the invite URL (logged in OR after signing in) is added as a member | ✗ FAILED | Logged-IN path fully wired (State A → JoinProjectButton → joinProject insert+redirect). After-signing-IN path BROKEN: invite page emits `/login?redirect=/invite/<token>` but login/signup ignore the param entirely (hard-coded `/dashboard`). No consumer of `redirect` anywhere. CR-01 confirmed in code. |
| 3 | Re-visiting an accepted invite link is idempotent (no duplicate membership rows) | ✓ VERIFIED | `joinProject` check-then-insert + SQLSTATE 23505 backstop (cause-unwrapping); migration 0001 adds `UNIQUE(project_id,user_id)`. Test "joinProject idempotency" (fresh + already-member) passes. |
| 4 | Owner can view a list of all project members with roles displayed | ✓ VERIFIED | Members page roster SELECT (innerJoin users) → `MemberList` renders name + role Badge (Owner/Member). Guarded by `requireProjectMember` before any project read (notFound on failure). |
| 5 | Owner can remove a member; removed member loses access immediately | ✓ VERIFIED | `removeMember` owner-guarded; rejects self-remove and owner-row; IDOR-scoped hard-delete; AlertDialog confirm in MemberList. Immediate access loss is structural (per-request requireProjectMember throws). Test "removeMember action" passes. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/project-access.ts` | requireProjectOwner reusing requireProjectMember role | ✓ VERIFIED | requireProjectOwner present; reuses returned role, no second query; falsy-id guard |
| `src/db/schema.ts` + migration 0001 | unique(project_id,user_id) | ✓ VERIFIED | `uniqueProjectMember` in schema; `project_member_project_id_user_id_unique` in 0001_uneven_thaddeus_ross.sql |
| `src/app/actions/invite.ts` | generateInviteLink owner-only | ✓ VERIFIED | Owner guard before write; 256-bit token; one row/project via db.batch |
| `src/app/actions/join.ts` | joinProject idempotent + redirect | ✓ VERIFIED | check-then-insert + 23505 backstop; redirect() outside try/catch |
| `src/app/actions/members.ts` | removeMember owner-only w/ guards | ✓ VERIFIED | Owner guard; self/owner-row rejection; scoped delete |
| `src/components/member-list.tsx` | roster rows + owner-only Remove + AlertDialog | ✓ VERIFIED | Role badges; showRemove gating; AlertDialog confirm → startTransition → removeMember |
| `src/components/invite-panel.tsx` | Copy + Regenerate/Generate | ✓ VERIFIED | navigator.clipboard, useActionState, both states |
| `src/components/join-project-button.tsx` | POST to joinProject, no client nav | ✓ VERIFIED | `<form action={formAction}>` useActionState(joinProject); no router.push |
| `src/components/ui/alert-dialog.tsx` | shadcn primitive | ✓ VERIFIED | 199 lines, AlertDialogAction present |
| `src/app/dashboard/projects/[id]/members/page.tsx` | roster + owner invite panel | ✓ VERIFIED | requireProjectMember first; owner-gated InvitePanel; MemberList |
| `src/app/invite/[token]/page.tsx` | three-state landing | ✓ VERIFIED (as designed) | States A/B/C present; State B's redirect target is dead due to CR-01 (gap is in login/signup, not here) |
| `src/app/(auth)/login/*`, `signup/*` | honor `redirect` param | ✗ FAILED | Param never read; hard-coded /dashboard |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| invite-panel.tsx | generateInviteLink | useActionState | ✓ WIRED | useActionState(generateInviteLink) |
| member-list.tsx | removeMember | AlertDialogAction onClick → startTransition | ✓ WIRED | handleRemove calls removeMember |
| members.ts | requireProjectOwner | owner guard before delete | ✓ WIRED | guard at line 54 before delete |
| invite/[token]/page.tsx | joinProject | JoinProjectButton form action | ✓ WIRED | JoinProjectButton → form action={formAction} |
| join.ts | unique constraint | 23505 → already-member → redirect | ✓ WIRED | code-unwrap + 23505 mapping |
| join.ts | /dashboard/projects/[id] | redirect() | ✓ WIRED | redirect outside try/catch |
| members/page.tsx | MemberList | isOwner + currentUserId props | ✓ WIRED | props passed |
| project [id]/page.tsx | /members | header Members link | ✓ WIRED | href line 77 |
| **invite/[token] State B** | **login/signup** | **/login?redirect=/invite/<token>** | ✗ NOT_WIRED | **redirect param has no consumer — login/signup hard-code /dashboard. Breaks SC#2 second path.** |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| members/page.tsx | roster | db.select join project_member/users by projectId | Yes (live DB query) | ✓ FLOWING |
| members/page.tsx | existingUrl | invitations.token + NEXT_PUBLIC_APP_URL | Yes if env set; `undefined/...` if unset | ⚠️ STATIC (WR-01 env dependency) |
| member-list.tsx | members | prop from page roster | Yes | ✓ FLOWING |
| invite-panel.tsx | inviteUrl | prop existingUrl | Yes if env set | ⚠️ env-dependent |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full membership test suite | `npx vitest run src/tests/membership.test.ts` | Test Files 1 passed; Tests 12 passed | ✓ PASS |
| Owner-only seam (MEM-03) | (in suite) | 4 tests pass | ✓ PASS |
| generateInviteLink (MEM-01) | (in suite) | 3 tests pass | ✓ PASS |
| joinProject idempotency (MEM-02) | (in suite) | 2 tests pass (fresh + already-member) | ✓ PASS |
| removeMember (MEM-05) | (in suite) | 3 tests pass | ✓ PASS |

Note (IN-04): no test exercises the expired/unknown-token `joinProject` path (D-28 unverified) — the expired-filter `gt(expiresAt, now)` is present in code but untested.

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` and no probe declarations in PLAN/SUMMARY. Verification relies on the vitest suite (run above). Probe execution: N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MEM-01 | 03-02 | Owner can generate a shareable invite link | ✓ SATISFIED | generateInviteLink + InvitePanel; test passes |
| MEM-02 | 03-03 | Invited person can accept link and join as member | ✗ BLOCKED | Logged-in join works; logged-out→sign-in→join broken (CR-01). REQUIREMENTS.md status must stay Pending. |
| MEM-03 | 03-01 | Two roles enforced (owner/member) | ✓ SATISFIED | requireProjectOwner reuses role; 4 tests pass |
| MEM-04 | 03-02 | View list of members in a project | ✓ SATISFIED | Members page roster + MemberList role badges |
| MEM-05 | 03-04 | Owner can remove a member | ✓ SATISFIED | removeMember owner-guarded + guards; 3 tests pass |

All 5 phase requirement IDs accounted for. No orphaned requirements (MEM-06 is correctly assigned to Phase 2, not this phase).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| invite.ts / members/page.tsx | 93 / 84 | `${process.env.NEXT_PUBLIC_APP_URL}` no fallback | ⚠️ Warning (WR-01) | Unset env → `undefined/invite/<token>` dead link copied by owner |
| login-form / signup-form | 50,76,90 / 58,85,103 | hard-coded `/dashboard` ignoring redirect | 🛑 Blocker (CR-01) | Logged-out invite flow non-functional |
| invite-panel.tsx | 46-56 | fallback select() shows "Copied!" without copying | ℹ️ Info (IN-03) | Misleading feedback in insecure context |
| membership.test.ts | 324-326 | token length asserted only `> 0` | ℹ️ Info (IN-02) | Weak-generator regression would pass |

No `TBD`/`FIXME`/`XXX` debt markers found in phase files (the WR-/CR-/IN- references are review citations, not in-code debt markers).

### Human Verification Required

1. **Logged-in invite join end-to-end** — open an invite URL while signed in, click Join, confirm member row + redirect. (Static data-flow verified; runtime render not.)
2. **Invite URL env correctness (WR-01)** — confirm copied URL is absolute and not `undefined/...`.
3. **Removed-member access loss (SC#5)** — confirm removed member hits notFound on next request.

### Gaps Summary

The phase is 4/5 on its roadmap Success Criteria and the technical foundation is strong: authorization runs before every project-scoped DB read, the unique constraint exists in migration 0001 and on the schema, idempotent join has both an app check and a 23505 backstop, removeMember is IDOR-scoped with owner/self guards, and the 12-test suite is fully GREEN.

The single blocking gap is **SC#2's "after signing in" half (MEM-02)**: the invite landing page correctly sends logged-out visitors to `/login?redirect=/invite/<token>`, but the `redirect` query param is dead — neither the login nor signup page/form reads it, and both hard-code navigation to `/dashboard` for email sign-in, GitHub OAuth, and the existing-session redirect. There is no middleware or auth-client code that honors it either. A logged-out invitee therefore can never reach the join screen, and the phase's primary "invite by shareable link" user story does not work for unauthenticated recipients. The fix spans the auth pages/forms (Phase 1 code) and must include a `safeRedirect` validator to avoid introducing an open-redirect (WR-05). This is not covered by any later milestone phase, so it is a real gap, not a deferred item.

Secondary (non-blocking) concerns: WR-01 (`NEXT_PUBLIC_APP_URL` fallback) can silently produce dead invite links; IN-04 leaves the expired-token join path untested.

---

_Verified: 2026-06-01T21:05:00Z_
_Verifier: Claude (gsd-verifier)_
