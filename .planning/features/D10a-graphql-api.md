# D10a — GraphQL API

## Goal
A typed GraphQL endpoint next to REST v1 so integrations fetch exactly the issue
graph they need in one round trip, with the same auth and permission model.

## UX (developer)
- `POST|GET /api/graphql` (graphql-yoga). GraphiQL only when `NODE_ENV=development`
  (GET from a browser; set the `Authorization` header in its headers pane).
- Auth: `Authorization: Bearer <lc_ API key | OAuth access token>`. OAuth tokens need
  scope `read` for queries and `write` for mutations; API keys carry both.
- Documented with curl + query examples in `docs/API.md`.

## Schema
- Types: Viewer, User, Project, WorkflowState, Label, Cycle, Epic, Comment,
  Issue (all IssueRow props + state, labels, assignee, creator, parent, children,
  comments, relations, cycle, epic, url), IssueRelation {id, type, issue},
  IssueConnection {nodes, pageInfo {hasNextPage, endCursor}}.
- Queries: `viewer`, `projects`, `project(id|key)`, `issue(id|key)`,
  `issues(projectId, filter, first, after)`, `search(query, projectId, first)`.
- Mutations: `createIssue`, `updateIssue`, `archiveIssue`, `deleteIssue` (trash),
  `createComment` — through `issue-service` / `createCommentAs` with the token's user
  as actor, so activity, notifications, Slack and webhooks see them.

## Data / security
- Every project-scoped read resolves the viewer's role first (per-request memo of
  `requireProjectMember`); non-members get "not found" (no enumeration), too-low
  role → FORBIDDEN. Mutations use the REST levels (write / comment).
- Issue list filter mirrors REST (`state`, `assignee`, `label`, `updatedSince`,
  `includeArchived`); cursor = issue number, `first` ≤ 100. Shared where-builder
  `src/lib/graphql/issue-list.ts` used by REST and GraphQL.
- Batching: per-request loaders (users, states, labels, cycles, epics, issues,
  children, comments, relations, roles) coalesce lookups across a tick.
- Limits: depth ≤ 6 validation rule (fragments followed), `first` ≤ 100, 100 KB body.

## Files
`src/app/api/graphql/route.ts`, `src/lib/graphql/{schema,resolvers,loaders,context,depth-limit,issue-list}.ts`,
REST `projects/[id]/issues/route.ts` refactored onto `issue-list.ts`.

## Edge cases
Trashed issues readable (deletedAt) but not writable; archived excluded from lists
unless asked; epics from other projects only resolve if the viewer can see them;
errors are GraphQL errors with `extensions.code` (UNAUTHENTICATED, FORBIDDEN,
NOT_FOUND, BAD_USER_INPUT); unexpected errors masked.
