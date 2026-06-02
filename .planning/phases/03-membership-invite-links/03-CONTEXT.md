# Phase 3: Membership + Invite Links - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

> **Note:** The user chose "go with what you think is best" for all gray areas.
> Every decision below is Claude's recommended call, grounded in the locked
> constraints, the existing schema, and the Phase 2 patterns. The user can revise
> any decision before/after planning.

<domain>
## Phase Boundary

A **project owner** generates a **single, reusable, email-free invite link** and
copies it. **Anyone with the link** (after signing in if needed) **joins the
project as a `member`**, idempotently — re-visiting never creates a duplicate
membership. **Any member** can view the **member roster** (names + roles). The
**owner** can **remove a member**, and the removed user **loses access on their
very next request** (no session invalidation needed, because authorization is
checked per-request through `requireProjectMember`).

**In scope:** owner-only invite-link generation/regeneration (MEM-01); a public
`/invite/[token]` acceptance flow with logged-out handling + idempotent join
(MEM-02); the two-role model already in the schema, surfaced via a thin
`requireProjectOwner` for owner-only actions (MEM-03); a member roster view
(MEM-04); owner-only remove-member with immediate access loss (MEM-05). A schema
migration adding a **unique constraint on `project_member (project_id, user_id)`**
to make idempotency race-safe.

**Out of scope (later phases / deferred):** owner-only project settings + GitHub
repo link (Phase 4, PROJ-04); ticket CRUD/assignment (Phase 5); email-delivered
invites and 3-tier roles (v2, REQUIREMENTS "Out of Scope"); self-service "leave
project" (deferred — MEM-05 is owner-removes-member only); reassigning/cleaning a
removed member's ticket assignments (Phase 5 concern).

</domain>

<decisions>
## Implementation Decisions

### Invite Link Model (MEM-01)
- **D-22:** **One reusable invite link per project**, not per-invite tokens. The
  existing `invitation` table holds **at most one active row per project** (the
  current link). Generating when none exists inserts a row; "Regenerate" **replaces
  the token** (delete-then-insert or update token + reset `expiresAt`), which
  **invalidates the previous link**. This matches the success criterion's singular
  "generate a shareable invite URL and copy it" and the reusable team-onboarding
  mental model.
- **D-23:** **Token is high-entropy and URL-safe.** `crypto.randomUUID()` (122 bits)
  is the acceptable floor; a 32-byte base64url token is preferred. The schema's
  `invitation.token` UNIQUE constraint stays. Tokens are unguessable — possession of
  the link is the authorization to join (capability URL).
- **D-24:** **Expiry: 30 days from generation** (`expiresAt` is NOT NULL in the
  schema, so a value is required). Regenerating resets the 30-day window. An expired
  or missing token yields the invalid-link UX (D-27). Long-but-bounded balances
  "share once with the team" against not leaving links live forever.
- **D-25:** **Invite generation is owner-only**, enforced server-side via a new
  `requireProjectOwner` (D-30). The absolute URL is built from `NEXT_PUBLIC_APP_URL`
  (already in `.env.local`/`.env.example`) → `${NEXT_PUBLIC_APP_URL}/invite/${token}`.

### Acceptance Flow (MEM-02, MEM-03 idempotency)
- **D-26:** **Route `/invite/[token]`** is a **public** App Router page (outside the
  `/dashboard` guarded tree). It resolves the token → project, then:
  - **Logged-out visitor:** redirect to login/signup carrying the return target
    (e.g. `?redirect=/invite/[token]` / callbackURL), then return to the invite page
    after auth. (Reuses Phase 1's auth pages; no new auth work.)
  - **Logged-in visitor:** render a **confirmation landing** — "You've been invited
    to join **{project name}**" with an explicit **"Join project"** button.
- **D-27:** **Joining is an explicit POST (Server Action), never a GET side effect.**
  Visiting the link only *shows* the landing; the membership INSERT happens when the
  user clicks "Join project". This prevents link-prefetchers/scanners/chat-unfurlers
  from silently joining and avoids mutating on a safe method.
- **D-28:** **Invalid / expired / unknown token → a clean "This invite link is
  invalid or has expired" page.** It does not leak project details beyond what the
  token grants. (Enumeration-resistance is moot here — the token *is* the secret —
  but we still avoid echoing internal data.)
- **D-29:** **Idempotent join.** The Join action checks membership first; if the user
  is **already a member or the owner**, it **skips the insert and just redirects** to
  the project. New members get a `project_member` row with `role: 'member'` (id via
  `crypto.randomUUID()`, matching `createProject`). On success → redirect to
  **`/dashboard/projects/[id]`**. A **new unique constraint on
  `project_member (project_id, user_id)`** is the race-safe backstop: a concurrent
  double-join hits SQLSTATE **23505**, which the action treats as "already a member"
  (success), mirroring the 23505 handling already in `createProject`.

### Roles & Authorization (MEM-03)
- **D-30:** **Add `requireProjectOwner(projectId, userId)` to
  `src/lib/project-access.ts`.** It calls `requireProjectMember` (reusing D-14's
  returned `role` — no second query) and throws `ProjectAccessError` (or a subclass)
  when `role !== 'owner'`. This is the single seam for the three owner-only actions
  (generate/regenerate link, remove member). No new roles — the schema's
  `['owner','member']` enum is unchanged (MEM-03; 3-tier roles stay v2).

### Member Management UI (MEM-04)
- **D-31:** **Dedicated members page at `/dashboard/projects/[id]/members`**, linked
  from the project detail header — keeps the detail page free for tickets (Phase 5/6)
  and gives invites + roster + remove one cohesive home (Linear-style "project people"
  view). Guarded by `requireProjectMember` → `notFound()` for non-members (D-15
  pattern). **Any member can view the roster** (MEM-04: "User can view the list of
  members"). **Owner-only controls** (invite link panel, remove buttons) are
  conditionally rendered for owners **and** enforced server-side via
  `requireProjectOwner` — never UI-only gating.
- **D-32:** Roster shows each member's **name** and a **role `Badge`**
  (owner/member), reusing the existing `badge`/`card`/`button`/`separator` shadcn
  primitives. The invite panel shows the current link (if any) with **Copy**
  (`navigator.clipboard`) and **Regenerate** buttons; **Copy** satisfies the
  "copy it without sending an email" criterion.

### Remove Member (MEM-05)
- **D-33:** **Owner-only `removeMember` Server Action** (guarded by
  `requireProjectOwner`). **Hard-deletes** the target `project_member` row, then
  `revalidatePath` the members page. **Protections:** cannot remove a row with
  `role: 'owner'` (the owner is unremovable in v1), and the action rejects a
  member's own id defensively. Members have no remove controls and the server
  rejects them regardless.
- **D-34:** **Immediate access loss is structural, not session-based.** Membership
  is **not** stored in the session JWT; every project-scoped read goes through
  `requireProjectMember` per request. Deleting the row means the removed user's
  **next** request throws `ProjectAccessError` → `notFound()`/403. A **confirmation
  step** (shadcn `dialog`, already installed, or an added `alert-dialog`) precedes
  the destructive remove.

### Claude's Discretion
- Exact token length/lib for D-23 (UUID vs nanoid vs 32-byte base64url) — planner's
  call, provided entropy is high and the value is URL-safe.
- Whether "regenerate" uses delete-then-insert vs. update-in-place for the single
  invitation row (D-22) — either is fine as long as one active row per project holds.
- Login-return mechanism for D-26 (query param vs Better Auth `callbackURL`) — match
  whatever Phase 1's auth pages already support.
- `alert-dialog` vs reusing the installed `dialog` for the remove confirmation (D-34).
- Members-page layout details (list vs cards), empty/owner-only states, and the
  exact members-link affordance on the detail header.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Locked Constraints
- `CLAUDE.md` — locked tech stack; the split Neon driver rule (neon-http `db` has
  **no interactive transactions** → use `db.batch`, not interactive tx); CVE-2025-29927
  "middleware is not the security boundary"; `@neondatabase/serverless@^0.10.4` pin.
- `.planning/PROJECT.md` §Constraints + §Key Decisions — multi-tenant model and the
  authorization intent behind MEM-06 that invites/removal must respect.

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Membership (MEM-01..05) + §"Out of Scope" — email-free
  copy-paste invites, owner+member only (no 3-tier), no email-delivered invites.
- `.planning/ROADMAP.md` §"Phase 3: Membership + Invite Links" — goal + the 5 success
  criteria (esp. #3 idempotent re-visit, #5 immediate access loss).

### Carried-Forward State & Prior Decisions
- `.planning/STATE.md` §Accumulated Context — "Shareable invite link, no email" decision;
  the resolved Org-plugin question; IDOR pitfall (#3).
- `.planning/phases/02-projects-authorization-layer/02-CONTEXT.md` — **D-12** (hand-rolled
  tables, no Org plugin), **D-13** (`requireProjectMember` is THE seam, 403-before-DB),
  **D-14** (helper returns `role` → reuse for `requireProjectOwner`), **D-15** (notFound
  enumeration-resistance for pages, 403 for actions).

### Code (analog files & patterns — read before writing)
- `src/db/schema.ts` — `invitations` (`token` unique, `expiresAt` NOT NULL),
  `projectMembers` (`role` enum, **needs** new unique `(project_id, user_id)`),
  `projects` (`ownerId`). Adding the unique constraint requires a Drizzle
  migration + `drizzle-kit push` (schema-push gate in plan-phase will flag this).
- `src/lib/project-access.ts` — `requireProjectMember`, `ProjectAccessError`,
  `ProjectMembership`; the exact shape `requireProjectOwner` extends (D-30).
- `src/app/actions/projects.ts` — Server Action pattern to copy: `getSession({ headers })`,
  validation-before-write, `crypto.randomUUID()` ids, **23505 handling**, `revalidatePath`.
- `src/lib/db.ts` — `db` (neon-http) vs `authDb` split; app queries use `db`.
- `src/lib/auth.ts` — Better Auth instance + `nextCookies()` plugin (Server Actions
  may set cookies / revalidate); source of the login-return capability.
- `src/app/dashboard/projects/[id]/page.tsx` — project detail page; add the members-page
  link in its header.
- `src/app/dashboard/layout.tsx` — `auth.api.getSession({ headers })` server-guard pattern
  for obtaining the current `userId`.
- `src/components/ui/` — installed: `badge`, `button`, `card`, `dialog`, `input`,
  `label`, `separator`. `alert-dialog` is NOT installed (add via shadcn CLI if chosen
  for the remove confirmation, D-34).
- `.env.local` / `.env.example` — `NEXT_PUBLIC_APP_URL` for building the absolute
  `/invite/[token]` URL (D-25).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`requireProjectMember` / `ProjectAccessError` / `ProjectMembership`**
  (`src/lib/project-access.ts`) — `requireProjectOwner` wraps this, reusing the
  returned `role` (no extra query).
- **`createProject` Server Action** (`src/app/actions/projects.ts`) — the template for
  `generateInviteLink`, `joinProject`, and `removeMember`: session resolution, id/timestamp
  generation, 23505 mapping, `revalidatePath`.
- **shadcn primitives** (`src/components/ui/`) — `card`/`badge`/`button`/`separator`/`dialog`
  cover the roster, role badges, and the invite + remove controls.

### Established Patterns
- **Per-request authorization** via `requireProjectMember` (membership never cached in the
  session JWT) — this is what makes removal take effect immediately (D-34).
- **Security = server code, not middleware** (CVE-2025-29927) — owner gating is enforced in
  the Server Action via `requireProjectOwner`, never UI-only or in `middleware.ts`.
- **23505 → field/state error** (already in `createProject`) — reused as the idempotency
  backstop for `joinProject` (treat as "already a member").

### Integration Points
- New unique constraint on `project_member (project_id, user_id)` extends the existing schema;
  needs a migration + push before verification (false-positive risk if types come from config,
  not the live DB).
- `/invite/[token]` is the first **public** (un-guarded) app route — it lives outside
  `/dashboard` and handles its own auth redirect.
- Removing a member leaves their `ticket.assignee_id` references untouched for now (Phase 5
  cleanup) — `onDelete: 'set null'` only fires on user deletion, not membership removal.

</code_context>

<specifics>
## Specific Ideas

- **Single reusable link** (not per-invite tokens) with a **Regenerate** that invalidates the
  old one — simplest copy-paste team-onboarding model.
- **Explicit "Join project" confirmation** (POST), never silent join-on-visit — defends against
  link prefetch/unfurl side effects.
- **Idempotency enforced both ways:** check-then-insert in app code *and* a DB unique constraint
  as the race-safe backstop.
- **Owner is unremovable**, members have no remove controls — keep the owner/member model rigid
  for v1.

</specifics>

<deferred>
## Deferred Ideas

- **Self-service "leave project"** — not in MEM-05 (owner-removes-member only); revisit if needed.
- **Reassigning/clearing a removed member's ticket assignments** — Phase 5 (tickets) concern.
- **Per-invite tokens / multiple concurrent links / usage analytics / revoke-specific-link** —
  v1 uses one reusable link per project; richer invite management is a future enhancement.
- **Email-delivered invitations and 3-tier (owner/admin/member) roles** — explicitly v2
  (REQUIREMENTS "Out of Scope").
- **Owner transfer / changing a member's role** — not a Phase 3 requirement.

None of these expanded Phase 3 scope — the discussion stayed within the membership + invite-link boundary.

</deferred>

---

*Phase: 3-Membership + Invite Links*
*Context gathered: 2026-06-01*
