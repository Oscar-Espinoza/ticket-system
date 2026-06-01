# Feature Research

**Domain:** Multi-tenant ticket / issue-tracking system with GitHub integration
**Researched:** 2026-06-01
**Confidence:** HIGH (table stakes and GitHub-sync workflow); MEDIUM (competitor behavioral details)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any tracker. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| User accounts (email/password) | Every SaaS product has login | LOW | bcryptjs hash; Credentials provider in Auth.js v5 |
| Project creation with a name | Without named projects there is no multi-tenancy | LOW | Simple form; generates ticket key prefix (e.g. "APP") |
| Per-project ticket identifier (APP-42) | Users need stable, human-readable references to paste into Slack / PRs | MEDIUM | Atomic `UPDATE … RETURNING` counter per project; race-safe without distributed transactions |
| Create / edit / delete tickets | Core CRUD on the primary entity | LOW | Title + description minimum; assignee added to the same form |
| Ticket assignee field | Teams need to know who owns what | LOW | Dropdown of project members; nullable |
| Kanban board with drag-and-drop | Visual workflow is expected from a "Linear-style" tool | HIGH | @dnd-kit; columns map to ticket statuses; optimistic update on drop |
| Fixed status columns (Backlog → Todo → In Progress → In Review → Done) | Users need a default workflow out of the box | LOW | Five statuses cover development lifecycle; "In Review" and "Done" are the GitHub-sync targets |
| Project member list / settings view | Owners need to see who is on the project | LOW | Simple list with role badge; owner-only actions gated |
| Invite collaborators via shareable link | Teams must be able to add members | MEDIUM | Token stored in DB; one-time or reusable link; accept flow upserts membership row |
| Owner vs. member role enforcement | Without roles, any member can accidentally delete the project | LOW | Middleware / server action guard; owner = full control, member = ticket CRUD only |
| Connect-GitHub gate for repo features | Email/password users have no token; repo actions must be unavailable until linked | MEDIUM | "Connect GitHub" button initiates OAuth; stores access_token against user; feature flags shown only when token exists |

### Differentiators (Competitive Advantage)

These are the features that justify building this instead of using a generic to-do list. The GitHub sync is the entire core value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sign in with GitHub (OAuth) | One-click onboarding for developers; also required to get a GitHub token for repo features | MEDIUM | Auth.js GitHub provider; token stored in accounts table via Drizzle adapter |
| Create GitHub branch from a ticket | Eliminates manual `git checkout -b app-42-ticket-title` and encodes the ticket ID in the branch name | MEDIUM | GitHub REST `POST /repos/{owner}/{repo}/git/refs` with `ref: refs/heads/{branchName}` and SHA of default branch; requires user OAuth token with `repo` scope; branch name generated as `{key-lowercase}-{number}-{slugified-title}` (e.g. `app-42-add-login-page`) |
| Auto-move ticket to "In Review" on PR open | Removes the manual status update that developers skip | MEDIUM | GitHub webhook `pull_request` event, `action: "opened"`; extract ticket identifier from branch name using regex `[a-z]+-\d+`; match against project tickets; update status if current status is Backlog / Todo / In Progress |
| Auto-move ticket to "Done" on PR merge | Closes the loop — merge = done, zero manual steps | MEDIUM | Same webhook; `action: "closed"` with `pull_request.merged === true`; update status to Done; do not regress a ticket that was already Done |
| Per-user GitHub token (not shared PAT) | Each branch is created by the actual developer's account; correct attribution in multi-tenant | LOW | Design decision already made; enforced by requiring Connect-GitHub before showing branch button |
| Per-project webhook scoping | Webhook is registered on a specific repo per project, not globally | MEDIUM | Store `webhook_id` + `webhook_secret` on the project row; use secret for HMAC-SHA256 signature verification on incoming webhook calls |

### Anti-Features (Explicitly Not Building in v1)

Features that are commonly requested but are deliberately out of scope. These are already decided in PROJECT.md; this section documents the UX reasoning so developers do not re-add them.

| Feature | Why Requested | Why Deferred | What to Do Instead |
|---------|---------------|-------------|-------------------|
| Labels / tags | Users want to filter and categorize tickets | Adds schema complexity (many-to-many), UI surface, and filter logic with no GitHub-sync value | v2; filter by assignee and status covers most small-team needs |
| Priority field (P0–P3) | Teams want to order urgency | Another column with no automated behavior; ordering by drag within a column is sufficient | Users reorder cards manually; priority is implicit in column position |
| Due dates | Deadlines are real | Requires date picker, calendar views, overdue surfacing; disproportionate to v1 scope | v2; milestones if Linear-style cycles are added |
| Comments / activity feed on tickets | Collaboration and audit trail | Requires real-time or polling, threaded UI, notifications; large scope increase | Use linked PR review comments in GitHub; that's where the code discussion lives |
| Sub-tasks / issue hierarchy | Complex work breakdown | Parent/child ticket relationships add significant schema and UI complexity | v2 if needed |
| Real-time board sync across tabs/users | Reduces conflicts on shared boards | Requires WebSockets or SSE, adds infra cost, violates free-tier constraint | Optimistic updates + `router.refresh()` / `revalidatePath` is sufficient; users see their own moves instantly |
| Email-delivered invitations | Familiar UX | Requires an email provider (Resend, Postmark); costs money and adds infra dependency | Copy-paste invite link is sufficient for small teams; users share it over Slack / Discord |
| Three-tier roles (admin / member / viewer) | Viewer-only access for stakeholders | Permission matrix grows combinatorially; owner + member covers 95% of small-team cases | v2 if a stakeholder use case emerges |
| Shared / org-level PAT for GitHub | Simpler setup for admins | Single token cannot act as multiple users; kills attribution; security risk if token leaks | Per-user OAuth tokens are the only correct design for multi-tenant |
| Bulk ticket operations | Power-user efficiency | Requires multi-select UI, confirmation flows; adds complexity with low early-user value | v2 |

---

## Feature Dependencies

```
[User accounts]
    └──required by──> [Project creation]
                          └──required by──> [Ticket CRUD]
                                                └──required by──> [Kanban board]
                                                └──required by──> [Ticket identifier (APP-42)]

[Invite link]
    └──required by──> [Project members list]
    └──required by──> [Ticket assignee field]
    └──required by──> [Owner/member role enforcement]

[Sign in with GitHub / Connect-GitHub OAuth]
    └──required by──> [Create branch from ticket]
    └──required by──> [Auto-move on PR open]
    └──required by──> [Auto-move on PR merge]

[Create branch from ticket]
    └──enables──> [Auto-move on PR open]  (branch name IS the ticket linkage key)
    └──enables──> [Auto-move on PR merge]

[Project has GitHub repo configured + webhook registered]
    └──required by──> [Auto-move on PR open]
    └──required by──> [Auto-move on PR merge]

[Ticket identifier (APP-42)]
    └──feeds──> [Branch name slug] (branch name encodes the identifier for regex matching in webhook)
```

### Dependency Notes

- **Branch name IS the link:** The GitHub integration does not use magic comment parsing or a separate link table to join PRs to tickets. The branch name itself encodes the ticket identifier (`app-42-…`). The webhook handler extracts this with a regex and looks up the ticket. This means branch creation must use the correct naming convention or the auto-status feature silently does nothing.

- **Connect-GitHub must precede all GitHub features:** A user with only email/password has no `access_token`. The UI must gate the "Create branch" button and the repo-connection flow behind a "Connect your GitHub account" CTA. The project-level webhook setup also requires at least one user with a token that has `admin:repo_hook` scope.

- **Invite precedes assignee:** The assignee dropdown on a ticket can only show project members. The invite + accept flow must exist before the assignee field is useful (they can both ship in the same phase but the DB rows must be consistent).

- **Ticket counter requires atomic update:** The `APP-42` identifier requires an `UPDATE projects SET ticket_counter = ticket_counter + 1 RETURNING ticket_counter` pattern. Using `SELECT` then `INSERT` is a race condition under concurrent ticket creation. This is a schema-level constraint, not a UI feature, but it is a prerequisite for displaying identifiers at all.

---

## GitHub-Sync Workflow: Concrete Behavior

This section documents the exact expected behavior for the differentiating feature.

### Branch Name Convention

Generated format: `{project-key-lowercase}-{ticket-number}-{slugified-title}`

Examples:
- Ticket `APP-42` titled "Add login page" → branch `app-42-add-login-page`
- Ticket `BE-7` titled "Fix null pointer in auth middleware" → branch `be-7-fix-null-pointer-in-auth-middleware`

Slugification rules: lowercase, replace spaces and special characters with hyphens, collapse consecutive hyphens, trim trailing hyphens, max ~60 characters to avoid shell issues.

The branch is created off the repository's default branch (usually `main`). The API call is `POST /repos/{owner}/{repo}/git/refs` with `ref: "refs/heads/{branchName}"` and the SHA of the default branch's latest commit (fetched first via `GET /repos/{owner}/{repo}/branches/{defaultBranch}`).

### PR Opened → "In Review"

1. GitHub fires `pull_request` webhook, `action: "opened"`.
2. Webhook handler verifies HMAC-SHA256 signature using the project's stored `webhook_secret`.
3. Extract `pull_request.head.ref` (the branch name).
4. Run regex `([a-z]+-\d+)` against the branch name to extract the ticket identifier (e.g. `app-42`).
5. Normalize: uppercase key + parse number → look up ticket in DB by `(project.key, ticket.number)`.
6. If found, and current status is NOT already "In Review" or "Done", update status to "In Review".
7. Store the PR URL on the ticket (display link in ticket detail view).
8. If no ticket matches, log and return 200 (GitHub retries on non-2xx).

**Guard:** Do not regress. If a ticket is already "Done", opening a new PR does not move it back to "In Review".

### PR Merged → "Done"

1. GitHub fires `pull_request` webhook, `action: "closed"`.
2. Check `pull_request.merged === true`. If `false`, the PR was closed without merging — no status change.
3. Same HMAC verification, same branch-name extraction, same ticket lookup.
4. If found, update status to "Done" regardless of current status (a merged PR is the final signal).
5. If the ticket was already "Done", this is a no-op (idempotent).

### Multiple PRs per Ticket

- Any PR whose branch name contains the ticket identifier is linked.
- The "In Review" transition fires on the first `opened` event; subsequent PRs for the same ticket have no additional effect if the ticket is already "In Review" or "Done".
- The "Done" transition fires when ANY linked PR is merged. If the team opens a second PR for the same ticket after the first is closed-without-merge, merging the second PR will move the ticket to Done.
- There is no "un-done" on PR close without merge — once Done, only a manual drag on the kanban board can revert.

### PR Closed Without Merge

- `action: "closed"`, `pull_request.merged === false`.
- No status change. The ticket remains "In Review" (or whatever it was).
- The user must manually drag it back to "In Progress" if the PR was abandoned.

### Ticket-Repo Connection Setup

- Owner connects their GitHub account (OAuth).
- Owner visits project settings, selects a repo from a list (fetched via GitHub API using their token).
- App registers a webhook on the selected repo via `POST /repos/{owner}/{repo}/hooks` with `events: ["pull_request"]` and a generated secret.
- Stores `repo_full_name`, `webhook_id`, `webhook_secret` on the project row.
- All future webhook calls for this project are verified against `webhook_secret`.

---

## Invite & Role Behavior: Concrete Expectations

### Invite Link Flow

1. Owner navigates to project settings and clicks "Create invite link".
2. App generates a cryptographically random token, stores it in an `invite_links` table with `project_id`, `token`, `created_by`, and optionally `expires_at` (v1 can be non-expiring for simplicity).
3. Owner copies the URL: `https://app.example.com/invite/{token}`.
4. Recipient opens the link. If not logged in, they see a login/signup wall first, then are redirected back to the invite URL after auth.
5. App validates the token (exists, not already used if single-use, project still exists).
6. If the recipient is already a member of the project, show "You're already a member" and redirect to the project.
7. Otherwise, insert a `project_members` row with `role: "member"`, then redirect to the project board.
8. The owner who created the project gets `role: "owner"` at project creation time.

### Role Capabilities

| Action | Owner | Member |
|--------|-------|--------|
| View project and board | Yes | Yes |
| Create / edit / delete tickets | Yes | Yes |
| Assign tickets | Yes | Yes |
| Create branch from ticket | Yes (if GitHub connected) | Yes (if GitHub connected) |
| Invite new members (generate link) | Yes | No |
| Remove members | Yes | No |
| Rename / delete project | Yes | No |
| Connect GitHub repo to project | Yes | No |

---

## MVP Definition

### Launch With (v1) — All Items in PROJECT.md Active Requirements

- [ ] Email/password + GitHub OAuth auth
- [ ] Project creation with ticket key prefix
- [ ] Shareable invite link + accept flow
- [ ] Owner / member roles with server-side enforcement
- [ ] Ticket CRUD with auto-incrementing per-project identifier (APP-42)
- [ ] Ticket assignee field (dropdown of project members)
- [ ] Kanban board with drag-and-drop (5 fixed columns: Backlog, Todo, In Progress, In Review, Done)
- [ ] Connect-GitHub gate (OAuth token stored per user)
- [ ] Create GitHub branch from ticket (REST API, per-user token)
- [ ] PR opened → ticket moves to "In Review" (webhook)
- [ ] PR merged → ticket moves to "Done" (webhook)
- [ ] Deployed to Vercel free tier

### Add After Validation (v1.x)

- [ ] Reusable invite links with expiry / revocation — triggers when teams report link-sharing security concerns
- [ ] Ticket detail view with linked PR URL visible — trivial once PR URL is stored; raises polish bar
- [ ] Re-open ticket on PR close-without-merge (move back to "In Progress") — only add if users report friction leaving tickets stuck in "In Review"

### Future Consideration (v2+)

- [ ] Labels / priority / due dates — add if teams report lack of filtering as a blocker
- [ ] Comments / activity feed — add when teams ask for in-tool discussion
- [ ] Real-time board sync — add if multi-user conflicts become common; requires SSE or WebSocket upgrade
- [ ] Email invitations — add if copy-paste link has adoption friction
- [ ] Sub-tasks — add if teams manage complex projects with multiple work streams

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auth (email + GitHub OAuth) | HIGH | MEDIUM | P1 |
| Project + ticket CRUD | HIGH | LOW | P1 |
| Per-project ticket identifier | HIGH | MEDIUM | P1 |
| Kanban drag-and-drop | HIGH | HIGH | P1 |
| Invite link + roles | HIGH | MEDIUM | P1 |
| Create branch from ticket | HIGH | MEDIUM | P1 |
| PR open → In Review (webhook) | HIGH | MEDIUM | P1 |
| PR merge → Done (webhook) | HIGH | MEDIUM | P1 |
| Connect-GitHub gate / OAuth token storage | HIGH | MEDIUM | P1 |
| Ticket assignee | MEDIUM | LOW | P1 |
| Linked PR URL displayed on ticket | MEDIUM | LOW | P2 |
| Invite link expiry / revocation | LOW | LOW | P2 |
| Labels / priority | MEDIUM | MEDIUM | P3 |
| Comments | MEDIUM | HIGH | P3 |
| Real-time sync | LOW | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | Linear | Jira | GitHub Issues | Height | Our v1 Approach |
|---------|--------|------|---------------|--------|-----------------|
| Ticket identifier format | `ENG-42` (team prefix + number) | `PROJ-42` | `#42` (global per repo) | `T-42` | `APP-42` (owner-defined key prefix + per-project counter) |
| Branch creation | "Copy branch name" button + auto-link | Via plugin (Jira Git Integration) | Native "Create a branch" on issue | "Start developing" button | REST API call from ticket UI using user's OAuth token |
| PR open → status | Moves to configurable "In Progress" state | Via plugin | Links PR but no auto-status | Moves to configurable status | Hard-coded move to "In Review" |
| PR merge → status | Moves to configurable "Done" state | Via plugin | Closes issue if `closes #N` in PR body | Moves to "Done" or custom status | Hard-coded move to "Done" |
| Multiple PRs per ticket | All PRs shown; last merge wins Done | Depends on plugin | All PRs linked | All PRs shown | Any merge → Done; PRs stored as URL list |
| Invite model | Email + shareable link | Email | GitHub org member | Email + link | Shareable link only (no email provider needed) |
| Roles | Admin / Member / Guest (workspace) + Team Owner | Project Admin / Developer / Viewer | Write / Read / Triage | Admin / Member / Guest | Owner / Member (project-scoped) |
| Kanban defaults | To Do / In Progress / Done (customizable) | To Do / In Progress / Done (customizable) | Open / Closed only | To Do / In Progress / Done (customizable) | Fixed: Backlog / Todo / In Progress / In Review / Done |
| Real-time sync | Yes (WebSockets) | Yes | Yes | Yes | No (optimistic + revalidation) |

---

## Table-Stakes Gap Analysis

The v1 scope covers all table-stakes features for a developer-focused small-team tracker. The one area to flag:

**Status column customization is absent.** Linear, Jira, and Height all allow teams to rename or add columns. In v1, the five columns are fixed. This is acceptable for a small tool but may become a friction point for teams with non-standard workflows (e.g., QA stage). Flag for v1.x if users report it.

**No ticket description richness.** Most trackers support markdown in descriptions. Storing markdown and rendering it client-side is low complexity and improves the baseline experience significantly. This is not in the PROJECT.md active requirements, but a plain `<textarea>` for description is below-table-stakes for developer tools. Worth adding to ticket CRUD with minimal effort (a markdown renderer like `react-markdown`).

---

## Sources

- [Linear GitHub Integration Docs](https://linear.app/docs/github-integration)
- [Linear Board Layout Docs](https://linear.app/docs/board-layout)
- [Linear Invite Members Docs](https://linear.app/docs/invite-members)
- [Linear Branch Naming Changelog](https://linear.app/changelog/2020-04-13-branch-naming)
- [GitHub REST API: Create a Reference](https://docs.github.com/en/rest/git/refs#create-a-reference)
- [GitHub Webhook Events: pull_request](https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request)
- [Zero Blog: Updating a Linear Issue from a GitHub PR using Webhooks](https://tryzero.com/blog/updating-a-linear-issue-from-a-github-pull-request-using-webhooks)
- [Height GitHub Integration Docs](https://help.height.app/en/collections/1033382-github-gitlab-integrations)
- [Atlassian: Configure Kanban Columns](https://support.atlassian.com/jira-software-cloud/docs/configure-columns/)

---
*Feature research for: Multi-tenant ticket system with GitHub integration*
*Researched: 2026-06-01*
