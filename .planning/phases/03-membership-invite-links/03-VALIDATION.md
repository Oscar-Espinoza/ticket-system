---
phase: 03
slug: membership-invite-links
status: validated-partial
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-01
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed retroactively from PLAN/SUMMARY/VERIFICATION artifacts (State B).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.8 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/tests/membership.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~10 seconds (membership suite); requires live `DATABASE_URL` (Neon) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/tests/membership.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-02 | 01 | 0 | MEM-03 | T-03-01 | `requireProjectOwner` rejects non-owner/non-member; owner allowed; single query | integration | `npx vitest run src/tests/membership.test.ts -t requireProjectOwner` | ✅ | ✅ green |
| 03-01-01 | 01 | 0 | MEM-02 | T-03-02 / T-03-10 | `unique(project_id,user_id)` constraint backs 23505 idempotency | integration | `npx vitest run src/tests/membership.test.ts -t "joinProject idempotency"` | ✅ | ✅ green |
| 03-02-01 | 02 | 1 | MEM-01 | T-03-04 / T-03-05 | Owner-only invite gen; 256-bit base64url token; one row/project (delete-then-insert) | integration | `npx vitest run src/tests/membership.test.ts -t generateInviteLink` | ✅ | ✅ green |
| 03-02-02 | 02 | 1 | MEM-04 | T-03-06 | `requireProjectMember` before roster SELECT; role badges rendered | manual | — (see Manual-Only) | ❌ | ⚪ manual |
| 03-03-01 | 03 | 1 | MEM-02 | T-03-08 / T-03-10 | Idempotent join: fresh + already-member; 23505 backstop; redirect outside try/catch | integration | `npx vitest run src/tests/membership.test.ts -t "joinProject idempotency"` | ✅ | ✅ green |
| 03-03-01 | 03 | 1 | MEM-02 | T-03-09 / T-03-11 | Expired/unknown token → `{ error: 'invalid' }`, no member row (D-28) | integration | `npx vitest run src/tests/membership.test.ts -t "expired/unknown token"` | ✅ | ✅ green (IN-04 filled) |
| 03-03-02 | 03 | 1 | MEM-02 | T-03-08 | Logged-out → sign-in → return-to-invite (CR-01) | manual | — (see Manual-Only — BROKEN) | ❌ | ❌ escalated |
| 03-04-02 | 04 | 1 | MEM-05 | T-03-12..15 | Owner-only remove; self-remove + owner-row rejected; IDOR-scoped delete | integration | `npx vitest run src/tests/membership.test.ts -t removeMember` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⚪ manual*

---

## Wave 0 Requirements

Existing infrastructure covers all automatable phase requirements. The Wave-0 RED suite
(`src/tests/membership.test.ts`, authored in Plan 01) seeded stubs for MEM-01/02/03/05 that
Plans 02–04 turned GREEN. IN-04 (expired/unknown-token join) was added retroactively during
validation and is now GREEN.

- [x] `src/tests/membership.test.ts` — MEM-01, MEM-02, MEM-03, MEM-05 + IN-04
- [x] vitest already installed (no framework install needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Members page renders roster with role badges + owner-only InvitePanel | MEM-04 | Async server-component render; repo has no component-render harness (all tests are action/lib integration) | Sign in as owner, open `/dashboard/projects/<id>/members`; confirm member rows with Owner/Member badges and the InvitePanel visible only to owners |
| Logged-in invite join end-to-end | MEM-02 | Needs running app + live Neon + real session; data-flow verified statically | While signed in, open an invite URL, click Join, confirm redirect to project and a Member row appears in roster |
| Invite URL env correctness (WR-01) | MEM-01 | Depends on `NEXT_PUBLIC_APP_URL` deployment config not in repo | Confirm copied URL is absolute (never `undefined/invite/<token>`) with the env var set and unset |
| Removed-member immediate access loss (SC#5) | MEM-05 | Cross-session runtime behavior; structurally guaranteed by per-request `requireProjectMember` | Remove a member, then have that member request the project page; expect notFound |
| **Logged-out → sign-in → join (CR-01)** | **MEM-02** | **BROKEN — not a test gap. `/login?redirect=/invite/<token>` param has no consumer; login/signup hard-code `/dashboard`. Spans Phase 1 auth pages + needs a `safeRedirect` validator (WR-05).** | **ESCALATED: implementation defect. A logged-out invitee can never reach the join screen. Fix required before MEM-02 can be marked Satisfied in REQUIREMENTS.md.** |

---

## Validation Sign-Off

- [x] All automatable tasks have integration verify or Wave-0 coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (IN-04 gap filled)
- [x] No watch-mode flags (`vitest run`, not watch)
- [x] Feedback latency < 15s
- [ ] `nyquist_compliant: true` — **NOT set.** One requirement (MEM-04) is manual-only by nature, and MEM-02's logged-out path (CR-01) is an escalated implementation defect, not a passing test.

**Approval:** validated-partial 2026-06-01

---

## Validation Audit 2026-06-01

| Metric | Count |
|--------|-------|
| Gaps found | 1 (IN-04 — expired/unknown-token join) |
| Resolved | 1 |
| Escalated | 1 (CR-01 — logged-out join, impl defect) |
| Manual-only | 4 (MEM-04 roster render + 3 runtime checks) |

**Notes:** Phase 3 automated coverage is strong — 14/14 vitest integration tests GREEN across
MEM-01/02/03/05 plus the newly added IN-04 expired/unknown-token path. The phase is NOT
nyquist-compliant because MEM-04 (server-component roster render) has no automation harness and
MEM-02's logged-out invite flow (CR-01) is a broken implementation that no test can turn green
without a code fix in the Phase 1 auth pages.
