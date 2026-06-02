# Roadmap: Linear-Clone Ticket System

**Milestone:** v1 — Full GitHub-synced ticket management on free tiers
**Granularity:** Fine (9 focused phases)
**Coverage:** 27/27 v1 requirements mapped
**Mode:** MVP (vertical slices — each phase delivers demoable capability)
**Created:** 2026-06-01

---

## Phases

- [ ] **Phase 1: Auth + Database Foundation** - Working accounts, sessions, and the full DB schema
- [ ] **Phase 2: Projects + Authorization Layer** - Project creation, listing, and the `requireProjectMember` security primitive
- [ ] **Phase 3: Membership + Invite Links** - Invite link generation/acceptance and member management
- [ ] **Phase 4: Project Settings** - Owner can edit project name and link a GitHub repo
- [ ] **Phase 5: Tickets Core** - Full ticket CRUD with atomic per-project identifiers and ticket detail page
- [ ] **Phase 6: Kanban Board** - Five-column drag-and-drop board with persisted status changes
- [ ] **Phase 7: Connect GitHub + Branch Creation** - GitHub OAuth link flow and creating branches from tickets
- [ ] **Phase 8: Webhook Registration + Status Sync** - Per-project webhook registration and PR-driven ticket transitions
- [ ] **Phase 9: Deploy + Free-Tier Hardening** - Vercel deployment, environment audit, and free-tier validation

---

## Phase Details

### Phase 1: Auth + Database Foundation

**Goal:** Users can create accounts and stay signed in; the complete database schema exists as migrations
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):

  1. User can register with email and password, and the account persists across sessions
  2. User can sign in with GitHub OAuth and land on a protected dashboard page
  3. User can log out from any page and their session is cleared
  4. Refreshing the browser while signed in does not redirect to the login page
  5. All DB tables (`users`, `accounts`, `sessions`, `projects`, `project_members`, `invitations`, `tickets`) exist in Neon via Drizzle migrations with the pinned `@neondatabase/serverless@^0.10.4`

**Plans:** 2/3 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold Next.js 16, dual Neon drivers, full 7-table schema + applied migration, vitest (Walking Skeleton substrate)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Email/password auth slice: signup, login, session, server-guarded dashboard, logout

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — GitHub OAuth slice: minimal-scope sign-in, dashboard connected badge, token accessor seam

**UI hint**: yes

---

### Phase 2: Projects + Authorization Layer

**Goal:** Users can create projects and the server enforces project membership before any project-scoped operation
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** PROJ-01, PROJ-02, PROJ-03, MEM-06
**Success Criteria** (what must be TRUE):

  1. Authenticated user can create a project with a name and ticket key (e.g. "APP") and is auto-assigned as owner
  2. User's dashboard lists only projects they own or belong to
  3. User can open a project and view its ticket list (empty on creation)
  4. Any request to a project the user does not belong to is rejected with a 403 before touching the database

**Plans:** 1/4 plans executed

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Foundation: requireProjectMember DAL helper + ProjectAccessError, Wave 0 test suite, shadcn dialog install (MEM-06)

**Wave 2** *(blocked on Wave 1)*

- [ ] 02-02-PLAN.md — Create-project slice: useActionState Dialog + createProject Server Action (atomic db.batch, 23505 handling) (PROJ-01)
- [ ] 02-04-PLAN.md — Project-detail slice: /dashboard/projects/[id] guarded by requireProjectMember → notFound() before any DB read (PROJ-03, MEM-06)

**Wave 3** *(blocked on Wave 2)*

- [ ] 02-03-PLAN.md — Project-list slice: owned-or-member query with open/resolved counts + cards/empty state wired into dashboard (PROJ-02)
**UI hint**: yes

---

### Phase 3: Membership + Invite Links

**Goal:** Project owners can invite collaborators via a copy-paste link; invited users can join and be managed
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** MEM-01, MEM-02, MEM-03, MEM-04, MEM-05
**Success Criteria** (what must be TRUE):

  1. Project owner can generate a shareable invite URL and copy it without sending an email
  2. A person visiting the invite URL (logged in or after signing in) is added as a member of the project
  3. Re-visiting an accepted invite link is idempotent and does not create duplicate membership rows
  4. Owner can view a list of all project members with their roles displayed
  5. Owner can remove a member from the project; removed member loses access immediately

**Plans:** TBD
**UI hint**: yes

---

### Phase 4: Project Settings

**Goal:** Project owner can edit the project name and configure which GitHub repo the project is linked to
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** PROJ-04
**Success Criteria** (what must be TRUE):

  1. Owner can update the project name from the settings page and the change reflects everywhere it is displayed
  2. Owner can set or change the linked GitHub repo (owner/name fields) for the project
  3. Non-owner members cannot access or submit the project settings form

**Plans:** TBD
**UI hint**: yes

---

### Phase 5: Tickets Core

**Goal:** Users can create, view, edit, delete, and assign tickets; each ticket gets a unique per-project identifier
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** TKT-01, TKT-02, TKT-03, TKT-04, TKT-05, TKT-06, TKT-07
**Success Criteria** (what must be TRUE):

  1. Creating a ticket generates a unique identifier (e.g. "APP-1", "APP-2") with no duplicates even under concurrent creation
  2. User can edit a ticket's title and description; changes are saved and reflected on reload
  3. User can delete a ticket; it disappears from the project immediately
  4. User can assign a ticket to any project member using a picker scoped to that project's members
  5. User can change a ticket's status through all five values (backlog, todo, in_progress, in_review, done)
  6. User can open a ticket detail page that shows full ticket information (title, description, assignee, status, identifier)

**Plans:** TBD
**UI hint**: yes

---

### Phase 6: Kanban Board

**Goal:** Users can view all project tickets as a kanban board and drag cards between status columns
**Mode:** mvp
**Depends on:** Phase 5
**Requirements:** BOARD-01, BOARD-02
**Success Criteria** (what must be TRUE):

  1. All project tickets appear on the board organized into five status columns (Backlog, Todo, In Progress, In Review, Done)
  2. Dragging a ticket card from one column to another persists the status change to the database
  3. If a drag fails server-side, the card snaps back to its original column (no silent data loss)

**Plans:** TBD
**UI hint**: yes

---

### Phase 7: Connect GitHub + Branch Creation

**Goal:** Email/password users can link their GitHub account; any user with a linked GitHub account can create a branch directly from a ticket
**Mode:** mvp
**Depends on:** Phase 5, Phase 4
**Requirements:** GH-01, GH-02
**Success Criteria** (what must be TRUE):

  1. A user who signed up with email/password sees a "Connect GitHub" prompt and can link their GitHub account via OAuth without losing their session
  2. After connecting GitHub, the user can click "Create Branch" on a ticket and a branch named `{key-lowercase}-{number}-{slugified-title}` is created on the project's linked repo
  3. The created branch name is stored on the ticket and displayed in the ticket detail view
  4. A user without a linked GitHub account sees a clear "Connect GitHub first" message instead of the branch creation button
  5. The GitHub OAuth token is never returned to the client or embedded in the session JWT

**Plans:** TBD
**UI hint**: yes

---

### Phase 8: Webhook Registration + Status Sync

**Goal:** Opening or merging a pull request on a ticket's branch automatically advances the ticket's status
**Mode:** mvp
**Depends on:** Phase 7, Phase 4
**Requirements:** GH-03, GH-04, GH-05, GH-06
**Success Criteria** (what must be TRUE):

  1. When an owner connects a GitHub repo in project settings, a webhook is registered on that repo with a per-project HMAC secret
  2. Opening a PR on a ticket's branch automatically moves that ticket to "in_review" status
  3. Merging the PR automatically moves the ticket to "done" status
  4. The webhook handler rejects any request whose `X-Hub-Signature-256` header does not match the raw request body — returning 403 for tampered or unsigned payloads
  5. A POST to the webhook endpoint without a session cookie succeeds (the route is excluded from the auth middleware matcher)

**Plans:** TBD

---

### Phase 9: Deploy + Free-Tier Hardening

**Goal:** The app runs on a public Vercel URL using Neon production database, entirely within free tiers
**Mode:** mvp
**Depends on:** Phase 8
**Requirements:** DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):

  1. The app is accessible at a public Vercel URL with no paid services required
  2. The Neon production database has all schema migrations applied and is below the 512 MB free-tier limit
  3. All required environment variables are documented and set in Vercel project settings
  4. Vercel Hobby function timeout constraints are not exceeded by any endpoint (webhook handler uses `after()` to defer DB work)

**Plans:** TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Auth + Database Foundation | 2/3 | In Progress|  |
| 2. Projects + Authorization Layer | 1/4 | In Progress|  |
| 3. Membership + Invite Links | 0/? | Not started | - |
| 4. Project Settings | 0/? | Not started | - |
| 5. Tickets Core | 0/? | Not started | - |
| 6. Kanban Board | 0/? | Not started | - |
| 7. Connect GitHub + Branch Creation | 0/? | Not started | - |
| 8. Webhook Registration + Status Sync | 0/? | Not started | - |
| 9. Deploy + Free-Tier Hardening | 0/? | Not started | - |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| AUTH-01 | Phase 1 |
| AUTH-02 | Phase 1 |
| AUTH-03 | Phase 1 |
| AUTH-04 | Phase 1 |
| PROJ-01 | Phase 2 |
| PROJ-02 | Phase 2 |
| PROJ-03 | Phase 2 |
| MEM-06 | Phase 2 |
| MEM-01 | Phase 3 |
| MEM-02 | Phase 3 |
| MEM-03 | Phase 3 |
| MEM-04 | Phase 3 |
| MEM-05 | Phase 3 |
| PROJ-04 | Phase 4 |
| TKT-01 | Phase 5 |
| TKT-02 | Phase 5 |
| TKT-03 | Phase 5 |
| TKT-04 | Phase 5 |
| TKT-05 | Phase 5 |
| TKT-06 | Phase 5 |
| TKT-07 | Phase 5 |
| BOARD-01 | Phase 6 |
| BOARD-02 | Phase 6 |
| GH-01 | Phase 7 |
| GH-02 | Phase 7 |
| GH-03 | Phase 8 |
| GH-04 | Phase 8 |
| GH-05 | Phase 8 |
| GH-06 | Phase 8 |
| DEPLOY-01 | Phase 9 |
| DEPLOY-02 | Phase 9 |

**Total:** 27/27 v1 requirements mapped. No orphans.

---
*Roadmap created: 2026-06-01*
*Last updated: 2026-06-01 — initial creation*
