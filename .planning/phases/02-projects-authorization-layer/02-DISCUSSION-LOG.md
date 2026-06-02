# Phase 2: Projects + Authorization Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 2-Projects + Authorization Layer
**Areas discussed:** Auth model, Create-project UX + key rules, Authorization failure behavior, List + detail page shell

---

## Auth model (data model)

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled tables | Use the project/project_member/invitation tables already migrated in Phase 1; requireProjectMember queries project_member directly; supports email-free invites | ✓ |
| Better Auth Organization plugin | Adopt plugin's org/member/invitation model; defaults to emailed invites; would duplicate existing tables | |

**User's choice:** Hand-rolled tables
**Notes:** Closes the STATE open question carried from Phase 1. Plugin's emailed-invite default conflicts with the locked copy-paste invite flow (Phase 3).

## requireProjectMember reject style

| Option | Description | Selected |
|--------|-------------|----------|
| Throw before any project query | Membership check runs first; throws 403 before any project-scoped SELECT (success criterion 4) | ✓ |
| Return null, caller decides | Helper returns row or null; each caller branches; easier to forget a check | |

**User's choice:** Throw before any project query

## Create-project UX

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog on the dashboard | shadcn Dialog triggered by 'New project'; list re-renders on success | ✓ |
| Dedicated /dashboard/projects/new page | Full route with its own form page; heavier navigation | |

**User's choice:** Dialog on the dashboard

## Ticket key rules

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-uppercase, 2–6 letters, unique | Force uppercase; A–Z only, 2–6 chars; reject duplicates inline | ✓ |
| Auto-derive from name, editable | Prefill key from project name, allow override | |
| Free text, validate on submit | Anything goes, validate only on submit | |

**User's choice:** Auto-uppercase, 2–6 letters, globally unique (schema constraint)

## Authorization page-reject behavior

| Option | Description | Selected |
|--------|-------------|----------|
| 404 Not Found — hide existence | notFound() for non-members; enumeration-resistant; actions still return 403 | ✓ |
| 403 Forbidden page | Explicit 'no access' page; confirms project exists to outsiders | |

**User's choice:** 404 Not Found — hide existence (actions return 403)

## requireProjectMember return shape

| Option | Description | Selected |
|--------|-------------|----------|
| Return the row incl. role | Returns { projectId, userId, role }; Phase 3/4 reuse role for owner checks | ✓ |
| Return only a boolean / void | Asserts membership and throws; owner-gating adds a separate query later | |

**User's choice:** Return the row incl. role

## Dashboard list item + empty state

| Option | Description | Selected |
|--------|-------------|----------|
| Card: name, key badge, role badge | Clickable Card with name, ticket-key badge, owner/member badge; empty-state CTA | ✓ (extended) |
| Minimal: name + key only | Plain rows, no role indicator | |

**User's choice:** Card with name + key badge + role badge, **plus open and resolved ticket counts** (user addition)
**Notes:** User extended the recommended option to also show the number of open and resolved tickets per project.

## Open vs resolved count split

| Option | Description | Selected |
|--------|-------------|----------|
| Open = not done; Resolved = done | Open = backlog+todo+in_progress+in_review; Resolved = done | ✓ |
| Open = active only; Resolved = in_review + done | Treats review as effectively finished | |

**User's choice:** Open = not done; Resolved = done

## Project detail page scope (Phase 2)

| Option | Description | Selected |
|--------|-------------|----------|
| Header + empty ticket-list placeholder | Project header + 'No tickets yet' panel; no New-ticket button | ✓ |
| Header + disabled 'New ticket' button | Also render a disabled control as a seam | |
| Header only | Just the header; add ticket area in Phase 5 | |

**User's choice:** Header + empty ticket-list placeholder (no non-functional controls)

---

## Claude's Discretion

- Exact DAL file name/location for requireProjectMember (following src/lib/ convention)
- Server Action vs route-handler for the create mutation
- ID generation strategy for new project/project_member rows (match Phase 1)
- Card layout details, error styling (toast vs inline), list ordering

## Deferred Ideas

- Invite links / member list / remove-member — Phase 3 (MEM-01..05)
- Owner-only project settings + GitHub repo link — Phase 4 (PROJ-04)
- Ticket CRUD, New-ticket button, atomic counter — Phase 5
- Per-owner (vs global) ticket-key uniqueness — needs migration; v1 keeps global
- Project deletion, list sorting/search, name-format validation — revisit if needed
