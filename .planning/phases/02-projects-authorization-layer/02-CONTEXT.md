# Phase 2: Projects + Authorization Layer - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Authenticated users can **create projects** (name + ticket key), see a **dashboard
list of the projects they own or belong to**, and **open a project** to a detail
page showing an (empty) ticket list. Underneath, this phase establishes
`requireProjectMember` — the server-side authorization primitive that rejects any
non-member from a project-scoped operation **before any project data is read**.

**In scope:** create-project flow (form + persistence + auto-owner membership),
owned-or-member project list with per-project ticket counts, project detail page
shell (header + empty ticket-list placeholder), and the `requireProjectMember`
DAL helper enforced on the detail page and every project-scoped action.
**Requirements:** PROJ-01, PROJ-02, PROJ-03, MEM-06.

**Out of scope (later phases):** invite-link generation/acceptance + member list +
remove-member (Phase 3, MEM-01..05), owner-only project settings / GitHub repo
link (Phase 4, PROJ-04), ticket CRUD + the New-ticket button + the atomic counter
(Phase 5), board (Phase 6). The `tickets` and `invitation` tables already exist
(Phase 1, D-06) but their features are not built here — Phase 2 only *reads
aggregate ticket counts* for list display (0 until Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Data Model (closes the STATE open question)
- **D-12:** Use the **hand-rolled** `project` / `project_member` / `invitation`
  tables already migrated in Phase 1 (D-06). **Do NOT adopt the Better Auth
  Organization plugin.** Rationale: the tables already exist; the plugin defaults
  to *emailed* invitations, which conflicts with the locked email-free copy-paste
  invite-link flow (Phase 3 / REQUIREMENTS "Out of Scope"). This formally resolves
  the open question carried from Phase 1 (`01-CONTEXT.md` deferred item; STATE Open
  Questions).

### Authorization Primitive (`requireProjectMember`)
- **D-13:** `requireProjectMember(projectId, userId)` is a **server-only DAL
  helper** in `src/lib/` (mirrors the `src/lib/github-token.ts` accessor pattern:
  `userId` arg, queries via the neon-http `db`, selects minimal columns). It runs
  the `project_member` membership check **first** and **throws a 403-equivalent
  error before any project-scoped SELECT runs** — satisfying success criterion 4
  ("rejected before touching the database"). It is the single authorization seam;
  every project-scoped action and the detail page call it.
- **D-14:** On success the helper **returns the membership row `{ projectId,
  userId, role }`**. Phase 2 ignores `role` (owner and member have identical view
  access), but returning it lets Phase 3/4 add a thin `requireProjectOwner`
  (owner-only invites/settings) by reusing the row — no extra query, no rework.
- **D-15:** **Reject rendering split by surface.** Server actions / API responses
  return **403**. The project **detail page** calls Next.js **`notFound()` (404)**
  for non-members so it does not confirm a project's existence to outsiders
  (enumeration-resistant, Linear-style). `requireProjectMember` still throws before
  any DB read in both cases; the page maps that throw to `notFound()`.

### Create-Project UX & Ticket Key
- **D-16:** Create via a **shadcn `Dialog` on the dashboard** triggered by a
  "New project" button — not a dedicated `/projects/new` route. The list
  re-renders on success (revalidate). Form fields: **name** + **ticket key**.
- **D-17:** **Ticket key** is **auto-uppercased as the user types**, restricted to
  **A–Z only, 2–6 characters**, and is **globally unique** (the schema's
  `ticketKey` unique constraint). A duplicate key surfaces an **inline error**.
  Global (not per-owner) uniqueness is accepted for v1 — narrowing it to per-owner
  would require a schema migration and is deferred.
- **D-18:** Creating a project inserts a `project` row **and** a `project_member`
  row with `role: 'owner'` for the creator (**auto-owner**, MEM-06 baseline).
  Because the neon-http `db` has **no interactive transactions** (CLAUDE.md / D
  driver split), the planner must use a safe sequential/batched write (e.g.
  Drizzle `db.batch`) and define behavior if the second insert fails (the project
  must not end up ownerless). The creator's `id` comes from
  `auth.api.getSession({ headers })`.

### Project List & Detail Shell
- **D-19:** The dashboard renders inside the existing `{children}` seam of
  `src/app/dashboard/page.tsx` (D-09). It lists projects where the user is
  **owner OR member** (single query joining `project_member` on `userId`). Empty
  state: a centered **"No projects yet"** panel with the New-project CTA.
- **D-20:** Each project is a clickable **shadcn `Card`** showing: project **name**,
  the **ticket key as a `Badge`**, an **owner/member role `Badge`**, and
  **open vs resolved ticket counts**. **Open = tickets whose status ≠ `done`**
  (backlog, todo, in_progress, in_review); **Resolved = status = `done`**. Counts
  are computed with a `LEFT JOIN tickets` + grouped count (0/0 until Phase 5).
- **D-21:** The **project detail page** lives at **`/dashboard/projects/[id]`** and
  renders a **header (name + ticket key)** plus an **empty ticket-list placeholder
  panel ("No tickets yet")**. **No New-ticket button** (deferred to Phase 5) — ship
  no non-functional controls. Satisfies success criterion 3.

### Claude's Discretion
- Exact DAL file name/location for `requireProjectMember` (e.g.
  `src/lib/project-access.ts` vs `src/lib/dal.ts`) — planner's call, following the
  `src/lib/` accessor convention.
- Server Action vs route-handler for the create mutation (Phase 1 used the
  `nextCookies()` plugin; Server Action is the natural fit) — planner decides.
- ID generation for new `project` / `project_member` rows (the schema uses `text`
  PKs; match whatever id strategy Phase 1 established).
- Card layout details, error-toast vs inline-error styling, and list ordering
  (unless a success criterion forces a choice).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Locked Constraints
- `CLAUDE.md` — locked tech stack, the split Neon driver rule (neon-http `db` has
  **no interactive transactions**), `@neondatabase/serverless@^0.10.4` pin, and the
  CVE-2025-29927 "middleware is not the security boundary" constraint.
- `.planning/PROJECT.md` §Constraints + §Key Decisions — multi-tenant model and the
  per-project authorization intent behind MEM-06.

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Projects (PROJ-01..03) + §Membership (MEM-06) — the
  exact v1 requirements this phase satisfies; §"Out of Scope" confirms email-free
  invites (drives D-12).
- `.planning/ROADMAP.md` §"Phase 2: Projects + Authorization Layer" — goal + the 4
  success criteria (esp. #4: 403 *before* touching the DB).

### Carried-Forward State & Prior Decisions
- `.planning/STATE.md` §Accumulated Context — `requireProjectMember` decision, the
  now-resolved Org-plugin open question, and the IDOR pitfall (#3).
- `.planning/phases/01-auth-database-foundation/01-CONTEXT.md` — D-06 (hand-rolled
  tables), D-09 (dashboard seam), D-10 (server-side guard, not middleware).

### Code (analog files & patterns — read before writing)
- `src/db/schema.ts` — `project`, `projectMembers` (role enum), `tickets` (status
  enum) table shapes; `ticketKey` global-unique; `(project_id, ticket_number)` unique.
- `src/lib/github-token.ts` — the DAL accessor pattern `requireProjectMember`
  mirrors (server-only, `userId` arg, minimal-column select via `db`).
- `src/lib/db.ts` — the `db` (neon-http) vs `authDb` (neon-serverless) split; app
  queries use `db`.
- `src/app/dashboard/page.tsx` — the `{children}` seam (D-09) the list renders into.
- `src/app/dashboard/layout.tsx` — the `auth.api.getSession({ headers })` server
  guard pattern (D-10) used to obtain the current `userId`.
- `src/lib/auth.ts` — Better Auth instance + `nextCookies()` plugin (Server Actions
  can set cookies / revalidate).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **shadcn primitives** in `src/components/ui/`: `card`, `button`, `input`,
  `label`, `badge` — cover the list cards, the create Dialog form, and the role/key
  badges (a `dialog` component may need adding via the shadcn CLI).
- **`getGitHubToken` / `isGitHubConnected`** (`src/lib/github-token.ts`) — the exact
  shape to copy for `requireProjectMember`.
- **Dashboard shell** (`src/app/dashboard/page.tsx`) — renders the project list in
  its `{children}` slot without modifying the shell.

### Established Patterns
- **Server-side session resolution:** `auth.api.getSession({ headers: await headers() })`
  yields `session.user.id` — the source of `userId` for create + list + access checks.
- **DAL accessor seam:** server-only functions in `src/lib/` that take `userId`,
  query `db`, and select minimal columns (never over-fetch).
- **Security boundary = server code, not middleware** (CVE-2025-29927) — auth checks
  live in the page/layout/action, never in `middleware.ts`.

### Integration Points
- `requireProjectMember` queries `project_member`; Phase 3 (invites) and Phase 4
  (settings) extend it with an owner-role check reusing D-14's returned `role`.
- Project list ticket counts join `tickets` — the same table Phase 5 populates.

</code_context>

<specifics>
## Specific Ideas

- Project cards show **open and resolved ticket counts** (open = status ≠ `done`;
  resolved = `done`) — a user-requested addition to the standard name+key+role card.
- Non-member project access should be **enumeration-resistant**: `notFound()` on the
  page so outsiders can't confirm a project ID exists, while actions return a clean 403.
- Create flow stays **in-context** (dashboard Dialog) rather than navigating away.

</specifics>

<deferred>
## Deferred Ideas

- **Invite-link generation / acceptance, member list, remove-member** — Phase 3
  (MEM-01..05). `requireProjectOwner` (reusing D-14's role) lands there.
- **Owner-only project settings + GitHub repo link** — Phase 4 (PROJ-04).
- **Ticket CRUD, the New-ticket button, atomic per-project counter** — Phase 5.
  Phase 2 only reads aggregate ticket counts.
- **Per-owner (vs global) ticket-key uniqueness** — would need a schema migration;
  global uniqueness accepted for v1.
- **Project deletion, list sorting/search, name-format validation** — not raised as
  Phase 2 requirements; revisit if needed.

None of these expanded Phase 2 scope — discussion stayed within the
projects + authorization boundary.

</deferred>

---

*Phase: 2-Projects + Authorization Layer*
*Context gathered: 2026-06-01*
