---
phase: 3
slug: membership-invite-links
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-01
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| caller → requireProjectOwner/Member | projectId/userId are untrusted inputs from URL / FormData / session | tenant identity, role |
| client → generateInviteLink action | projectId from FormData untrusted; caller may not be owner | project membership grant |
| token in invite URL | the token IS the secret (capability URL) | join capability (256-bit secret) |
| public internet → /invite/[token] | first un-guarded route; token + session both untrusted | invitation existence, project membership |
| link prefetchers / unfurlers → invite URL | bots may GET the URL; must not auto-join | none (read-only render) |
| client → joinProject / removeMember actions | token / projectId / memberId from FormData untrusted; concurrent double-submit possible | membership row insert/delete |
| app code → live Neon DB | concurrent writes can race on (project_id, user_id) | membership row uniqueness |
| shadcn CLI → repo | registry install adds a ui primitive + a dependency | third-party code |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Elevation of Privilege | requireProjectOwner | mitigate | Delegates to requireProjectMember, rejects role !== 'owner' with ProjectAccessError; no second DB query (`project-access.ts:140-150`) | closed |
| T-03-02 | Tampering | concurrent join double-insert | mitigate | `unique(project_id,user_id)` constraint (`schema.ts:116`) + 23505 backstop (`join.ts:105`) | closed |
| T-03-03 | Spoofing | falsy projectId/userId | mitigate | `if (!projectId \|\| !userId) throw ProjectAccessError` before any read (`project-access.ts:97-99`) | closed |
| T-03-04 | Elevation of Privilege | generateInviteLink | mitigate | requireProjectOwner before any write; ProjectAccessError → `{ errors: { server: 'Forbidden' } }` (`invite.ts:54`) | closed |
| T-03-05 | Information Disclosure | invite token | mitigate | `randomBytes(32).toString('base64url')` — 256-bit, URL-safe, unguessable (`invite.ts:64`) | closed |
| T-03-06 | Information Disclosure | /members page IDOR | mitigate | requireProjectMember → notFound() before any roster SELECT (`members/page.tsx:43-47,63`) | closed |
| T-03-07 | Repudiation/Tampering | stale link reuse | mitigate | Regenerate = delete-then-insert in a batch, invalidates old token (`invite.ts:73-76`) | closed |
| T-03-08 | Tampering | auto-join on GET visit | mitigate | GET only renders landing; join fires only via explicit POST Server Action (`invite/[token]/page.tsx`, `join-project-button.tsx`) | closed |
| T-03-09 | Information Disclosure | invalid token page | mitigate | State C returns 200 generic message, never notFound(), no project internals (`invite/[token]/page.tsx:78-100`) | closed |
| T-03-10 | Tampering | duplicate membership under concurrent join | mitigate | check-then-insert + 23505 → "already a member" no-op → redirect (`join.ts:74-83,105`) | closed |
| T-03-11 | Elevation of Privilege | expired link reuse | mitigate | Lookup filters `gt(invitations.expiresAt, new Date())`; expired → `{ error: 'invalid' }`, no insert (`join.ts:55,62`). ⚠ Path untested (IN-04). | closed |
| T-03-12 | Elevation of Privilege | removeMember | mitigate | requireProjectOwner before any DELETE (`members.ts:54`) | closed |
| T-03-13 | Denial of Service | owner removes self/owner | mitigate | Rejects self-remove and rejects deleting an 'owner' row — project never ownerless (`members.ts:92,97`) | closed |
| T-03-14 | Tampering | IDOR remove across projects | mitigate | requireProjectOwner scoped; SELECT + DELETE both carry `AND projectId` (`members.ts:80-81,106-107`). Impl keys on row id (≥ as strong). | closed |
| T-03-15 | Information Disclosure | removed member retains access | mitigate | Per-request authz via requireProjectMember; membership not in JWT → next request fails | closed |
| T-03-SC | Tampering | shadcn CLI install (Plan 04) | mitigate | Official shadcn registry only; blocking-human checkpoint preceded install; alert-dialog primitive verified (`alert-dialog.tsx:188-189`). Plans 02/03 accepted (no installs). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-SC (Plans 02/03) | No package-manager installs in Plans 02/03; supply-chain surface is N/A for those plans. | Oscar Espinoza | 2026-06-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-01 | 16 | 16 | 0 | gsd-security-auditor (sonnet) |

---

## Non-Threat Findings (tracked elsewhere)

These were surfaced during audit but are **not** open security threats. They are functional/test-coverage gaps tracked in `03-VERIFICATION.md` / `03-REVIEW.md`:

| Flag | Source | Assessment |
|------|--------|------------|
| CR-01 | 03-VERIFICATION.md | Logged-out invite `redirect` param is never consumed by login/signup. Not a threat **today** — the param is not honored, so no redirect sink exists. ⚠ Future risk: if CR-01 is fixed, a `safeRedirect()` validator is required to avoid an open-redirect (WR-05). |
| WR-01 | 03-REVIEW.md | `NEXT_PUBLIC_APP_URL` unset → dead invite URLs. Operational defect, not a security threat. |
| IN-04 | 03-REVIEW.md | Expired-token `joinProject` path (T-03-11) untested. Filter is present and correct; test-coverage gap only. |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-01
