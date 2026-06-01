# Requirements: Linear-Clone Ticket System

**Defined:** 2026-06-01
**Core Value:** A ticket's status stays in sync with real GitHub work — create a branch from a ticket and merging its PR automatically marks the ticket done — without paying for any hosted service.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can create an account with email and password
- [ ] **AUTH-02**: User can sign in with GitHub OAuth
- [x] **AUTH-03**: User can log in with email/password and stay logged in across browser refreshes
- [x] **AUTH-04**: User can log out from any page

### Projects

- [ ] **PROJ-01**: User can create a project with a name and a ticket key (e.g. "APP")
- [ ] **PROJ-02**: User can view a list of projects they own or are a member of
- [ ] **PROJ-03**: User can open a project to view its tickets
- [ ] **PROJ-04**: Project owner can edit project settings (name, linked GitHub repo)

### Membership

- [ ] **MEM-01**: Project owner can generate a shareable invite link for a project
- [ ] **MEM-02**: An invited person can accept an invite link and join the project as a member
- [ ] **MEM-03**: Project enforces two roles — owner (manage members/project) and member (manage tickets)
- [ ] **MEM-04**: User can view the list of members in a project
- [ ] **MEM-05**: Project owner can remove a member from the project
- [ ] **MEM-06**: Every project-scoped action is authorized against the user's membership (no cross-tenant access)

### Tickets

- [ ] **TKT-01**: User can create a ticket with a title and description in a project
- [ ] **TKT-02**: New ticket receives a unique per-project identifier (e.g. "APP-42") from an atomic counter
- [ ] **TKT-03**: User can edit a ticket's title and description
- [ ] **TKT-04**: User can delete a ticket
- [ ] **TKT-05**: User can assign a ticket to a project member
- [ ] **TKT-06**: User can change a ticket's status (backlog, todo, in_progress, in_review, done)
- [ ] **TKT-07**: User can open a ticket detail page showing its full information

### Board

- [ ] **BOARD-01**: User can view project tickets on a kanban board with one column per status
- [ ] **BOARD-02**: User can drag a ticket card between columns to change its status, with the change persisted

### GitHub Integration

- [ ] **GH-01**: User can connect their GitHub account (OAuth with `repo` + `admin:repo_hook` scopes) to enable repo features
- [ ] **GH-02**: User can create a GitHub branch from a ticket using their own GitHub token; the branch name is stored on the ticket
- [ ] **GH-03**: The app registers a webhook on a project's linked repo (per-project secret) when the repo is connected
- [ ] **GH-04**: A ticket auto-moves to "in_review" when a pull request is opened on its branch
- [ ] **GH-05**: A ticket auto-moves to "done" when its pull request is merged
- [ ] **GH-06**: The webhook endpoint verifies the GitHub HMAC-SHA256 signature against the raw request body and rejects tampered/unsigned requests

### Deployment

- [ ] **DEPLOY-01**: The app deploys to a public URL on Vercel free tier with the production database schema pushed to Neon
- [ ] **DEPLOY-02**: App stays within free tiers (Neon, Vercel, GitHub) with no paid services required

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Ticket Enhancements

- **TKT2-01**: Labels on tickets
- **TKT2-02**: Priority levels
- **TKT2-03**: Due dates
- **TKT2-04**: Comments / discussion thread
- **TKT2-05**: Markdown rendering for ticket descriptions
- **TKT2-06**: Sub-tasks

### Collaboration

- **COLLAB-01**: Real-time / live board sync across users
- **COLLAB-02**: Email-delivered invitations
- **COLLAB-03**: Owner/Admin/Member three-tier roles

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time live board sync | Deferred to v2; optimistic updates + revalidation suffice for v1 and keep it free-tier |
| Email-delivered invites | Using copy/paste invite links; avoids needing an email provider |
| Three-tier roles / fine-grained permissions | Owner + member is enough for small teams |
| Labels, priority, due dates, comments, sub-tasks | v2 ticket features, not core to the GitHub-sync value |
| Shared org-wide PAT for branch creation | Replaced by per-user OAuth tokens for correct multi-tenant attribution |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| PROJ-01 | Phase 2 | Pending |
| PROJ-02 | Phase 2 | Pending |
| PROJ-03 | Phase 2 | Pending |
| MEM-06 | Phase 2 | Pending |
| MEM-01 | Phase 3 | Pending |
| MEM-02 | Phase 3 | Pending |
| MEM-03 | Phase 3 | Pending |
| MEM-04 | Phase 3 | Pending |
| MEM-05 | Phase 3 | Pending |
| PROJ-04 | Phase 4 | Pending |
| TKT-01 | Phase 5 | Pending |
| TKT-02 | Phase 5 | Pending |
| TKT-03 | Phase 5 | Pending |
| TKT-04 | Phase 5 | Pending |
| TKT-05 | Phase 5 | Pending |
| TKT-06 | Phase 5 | Pending |
| TKT-07 | Phase 5 | Pending |
| BOARD-01 | Phase 6 | Pending |
| BOARD-02 | Phase 6 | Pending |
| GH-01 | Phase 7 | Pending |
| GH-02 | Phase 7 | Pending |
| GH-03 | Phase 8 | Pending |
| GH-04 | Phase 8 | Pending |
| GH-05 | Phase 8 | Pending |
| GH-06 | Phase 8 | Pending |
| DEPLOY-01 | Phase 9 | Pending |
| DEPLOY-02 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 — traceability populated by roadmapper*
