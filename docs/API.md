# Public API

Two APIs over HTTPS, sharing credentials and permissions:

- **REST v1** — JSON at `https://<your-app>/api/v1` (below).
- **GraphQL** — `https://<your-app>/api/graphql` ([GraphQL API](#graphql-api)).

A request acts as the user who owns the API key or OAuth access token, with that
user's project roles — the API can never see or do more than the user can in the app.

Contents: [Authentication](#authentication) · [REST endpoints](#endpoints) ·
[GraphQL API](#graphql-api) · [OAuth apps](#oauth-apps-authorization-code--pkce) ·
[Outgoing webhooks](#outgoing-webhooks)

## Authentication

Send `Authorization: Bearer <credential>`, where the credential is either:

- a **personal API key** (`lc_…`) — create one in **Settings → API keys**. It is
  shown once; only a hash is stored. Keys can read and write.
- an **OAuth access token** issued to a third-party app the user authorized (see
  [OAuth apps](#oauth-apps-authorization-code--pkce)). Tokens are limited to their scopes:
  `read` for REST `GET` / GraphQL queries, `write` for REST writes / GraphQL mutations.
  A token without the needed scope gets `403` (`WWW-Authenticate: Bearer
  error="insufficient_scope"`).

```bash
export TICKETS_URL=https://your-app.example.com/api/v1
export TICKETS_KEY=lc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/me"
```

Revoking a key (same page) makes it fail immediately.

## Errors

Errors are JSON `{ "error": "message" }`, plus `"field"` when one input is at fault.

| Status | Meaning |
|---|---|
| 400 | Invalid JSON, parameter or field (`field` names it) |
| 401 | Missing, malformed or revoked API key; expired or revoked access token |
| 403 | You are a member, but your role can't do this (e.g. guests can't create issues), or the access token lacks the scope |
| 404 | Not found — also returned for projects/issues you are not a member of |
| 500 | Unexpected server error |

Roles: `owner` / `admin` / `member` can read and write; `guest` can read and comment.

## Identifiers

- **Project id** — from `GET /projects`.
- **Issue key** — `KEY-NUMBER`, e.g. `APP-12` (case-insensitive). Keys an issue had
  before it moved to another project keep resolving to it.
- State, label, member, cycle, epic and milestone ids come from the project endpoints.

## Endpoints

### `GET /me`

```bash
curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/me"
# { "user": { "id": "…", "name": "Ada", "email": "ada@example.com", "image": null } }
```

### `GET /projects`

Projects you belong to, with your role.

```bash
curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/projects"
# { "projects": [ { "id": "…", "name": "App", "key": "APP", "role": "member", … } ] }
```

### `GET /projects/:id/states` · `/labels` · `/members`

```bash
curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/projects/$PROJECT_ID/states"
# { "states": [ { "id": "…", "name": "Todo", "type": "unstarted", "color": "#747981", … } ] }

curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/projects/$PROJECT_ID/labels"
# { "labels": [ { "id": "…", "name": "Bug", "color": "#eb5757", "description": null } ] }

curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/projects/$PROJECT_ID/members"
# { "members": [ { "id": "…", "name": "Ada", "image": null, "role": "owner", "joinedAt": "…" } ] }
```

State `type` is one of `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`.

### `GET /projects/:id/issues`

Active issues, highest number first. Trashed issues are never listed.

| Query | Example | Notes |
|---|---|---|
| `state` | `state=In%20Progress`, `state=started`, `state=<id>` | state id, name or type |
| `assignee` | `assignee=me`, `assignee=none`, `assignee=<userId>` | |
| `label` | `label=Bug`, `label=<id>` | label id or name |
| `updated_since` | `updated_since=2026-09-01T00:00:00Z` | ISO 8601 |
| `include_archived` | `include_archived=true` | archived issues are excluded by default |
| `limit` | `limit=100` | 1–100, default 50 |
| `cursor` | `cursor=120` | `nextCursor` from the previous page |

```bash
curl -H "Authorization: Bearer $TICKETS_KEY" \
  "$TICKETS_URL/projects/$PROJECT_ID/issues?assignee=me&state=started&limit=20"
# { "issues": [ { "key": "APP-42", … } ], "nextCursor": "31" }

# next page
curl -H "Authorization: Bearer $TICKETS_KEY" \
  "$TICKETS_URL/projects/$PROJECT_ID/issues?assignee=me&state=started&limit=20&cursor=31"
```

`nextCursor` is `null` on the last page.

#### Issue object

```json
{
  "id": "…",
  "key": "APP-42",
  "number": 42,
  "projectId": "…",
  "title": "Checkout button misaligned",
  "description": "Markdown…",
  "state": { "id": "…", "name": "In Progress", "type": "started" },
  "priority": "high",
  "estimate": 3,
  "startDate": null,
  "dueDate": "2026-10-01",
  "assignee": { "id": "…", "name": "Ada", "image": null },
  "creator": { "id": "…", "name": "Grace", "image": null },
  "labels": [{ "id": "…", "name": "Bug", "color": "#eb5757" }],
  "parentId": null,
  "cycleId": null,
  "epicId": null,
  "milestoneId": null,
  "startedAt": "2026-09-20T10:00:00.000Z",
  "completedAt": null,
  "canceledAt": null,
  "archivedAt": null,
  "deletedAt": null,
  "createdAt": "2026-09-19T08:12:00.000Z",
  "updatedAt": "2026-09-20T10:00:00.000Z",
  "url": "https://your-app.example.com/dashboard/projects/…/issues/APP-42"
}
```

`priority` is one of `urgent`, `high`, `medium`, `low`, `none`.

### `POST /projects/:id/issues`

Requires write access. Only `title` is required; everything else is optional.
New issues without `stateId` land in the project's default state (Backlog).

```bash
curl -X POST -H "Authorization: Bearer $TICKETS_KEY" -H "Content-Type: application/json" \
  "$TICKETS_URL/projects/$PROJECT_ID/issues" \
  -d '{
    "title": "Checkout button misaligned",
    "description": "On Safari 18 the button overlaps the total.",
    "priority": "high",
    "stateId": "<state id>",
    "assigneeId": "<user id>",
    "labelIds": ["<label id>"],
    "estimate": 3,
    "dueDate": "2026-10-01"
  }'
# 201 { "issue": { … } }
```

Accepted fields: `title`, `description`, `stateId`, `priority`, `estimate`,
`startDate` / `dueDate` (`YYYY-MM-DD`), `assigneeId`, `labelIds`, `parentId`, `cycleId`,
`epicId`, `milestoneId`. Every id must belong to the project.

### `GET /issues/:key`

Includes archived and trashed issues (check `archivedAt` / `deletedAt`).

```bash
curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/issues/APP-42"
# { "issue": { … } }
```

### `PATCH /issues/:key`

Requires write access. Send only the fields to change; `null` clears a field;
`labelIds` replaces the whole label set, while `addLabelIds` / `removeLabelIds`
add or remove labels and keep the rest (use one style or the other, not both).
Trashed issues can't be edited (404).

```bash
curl -X PATCH -H "Authorization: Bearer $TICKETS_KEY" -H "Content-Type: application/json" \
  "$TICKETS_URL/issues/APP-42" \
  -d '{ "stateId": "<done state id>", "assigneeId": null }'
# { "issue": { … } }
```

### `DELETE /issues/:key`

Requires write access. Moves the issue to the trash (restorable in the app).

```bash
curl -X DELETE -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/issues/APP-42"
# { "issue": { …, "deletedAt": "2026-09-24T12:00:00.000Z" } }
```

### `GET /issues/:key/comments`

Oldest first. Replies have `parentId` set to their thread's root comment.

```bash
curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/issues/APP-42/comments"
# { "comments": [ { "id": "…", "parentId": null, "body": "…", "author": { … },
#                   "createdAt": "…", "editedAt": null, "reactions": [] } ] }
```

### `POST /issues/:key/comments`

Requires comment access (guests included). `body` is markdown (mention a
member with `@[Name](user:USER_ID)`); `parentId` replies in a thread.

```bash
curl -X POST -H "Authorization: Bearer $TICKETS_KEY" -H "Content-Type: application/json" \
  "$TICKETS_URL/issues/APP-42/comments" \
  -d '{ "body": "Deployed the fix to staging." }'
# 201 { "comment": { … } }
```

Everything done through the API shows up in the issue's activity, notifications,
Slack and outgoing webhooks exactly like changes made in the app.

## GraphQL API

`POST https://<your-app>/api/graphql` with `{ "query": "…", "variables": { … } }`
(GET with `?query=` works for queries). Same credentials, roles and scopes as REST;
a missing or invalid credential is an HTTP `401` like REST. Other errors come back
in `errors[]` with `extensions.code`: `FORBIDDEN` (role or scope), `NOT_FOUND` (also for things you can't see),
`BAD_USER_INPUT` (plus `extensions.field`). In development, open `/api/graphql` in
a browser for GraphiQL (add the `Authorization` header in its headers pane).

Limits: selection depth ≤ 6, ≤ 500 fields per operation, `first` ≤ 100 (`search`:
≤ 50), request body ≤ 100 KB. Nested lookups (assignees, labels, states, parents,
children, comments…) are batched per request, so wide queries stay cheap.

### Schema overview

| Query | Returns |
|---|---|
| `viewer` | `Viewer { id name email image projects }` |
| `projects` | projects you belong to |
| `project(id: ID, key: String)` | `Project` or `null` |
| `issue(id: ID, key: String)` | `Issue` or `null` (archived / trashed included) |
| `issues(projectId: ID!, filter: IssueFilter, first: Int = 50, after: String)` | `IssueConnection { nodes pageInfo { hasNextPage endCursor } }` |
| `search(query: String!, projectId: ID, first: Int = 20)` | `[Issue!]!` (full-text over titles, descriptions, comments) |

| Mutation | Notes |
|---|---|
| `createIssue(input: IssueCreateInput!)` | `projectId`, `title` + any issue field |
| `updateIssue(id \| key, input: IssueUpdateInput!)` | absent = untouched, `null` clears; `labelIds` replaces, `addLabelIds` / `removeLabelIds` adjust |
| `archiveIssue(id \| key)` · `deleteIssue(id \| key)` | delete = move to trash |
| `createComment(input: { issueId \| issueKey, body, parentId })` | guests may comment |

Types: `Project { id name key description icon color role triageEnabled
cyclesEnabled estimateScale states labels members cycles epics issues url }`,
`Issue { id key number title description state priority estimate startDate
dueDate assignee creator labels parent children cycle epic milestoneId comments
relations { id type issue } githubBranch slaDueAt … createdAt updatedAt url }`,
`WorkflowState`, `Label`, `Cycle`, `Epic`, `Comment`, `User`. Enum values are
lowercase (`priority: high`, `state { type }` = `started`, relation `type` =
`blocks | blocked_by | related | duplicate_of | duplicated_by`). `IssueFilter`
mirrors the REST list: `state` (id, name or type), `assignee` (id, `me`, `none`),
`label` (id or name), `updatedSince`, `includeArchived`. Introspect the endpoint
for the full schema.

### Examples

```bash
export GQL=https://your-app.example.com/api/graphql

# My started issues in a project, with labels and sub-issues
curl -s -X POST "$GQL" -H "Authorization: Bearer $TICKETS_KEY" -H "Content-Type: application/json" \
  -d '{"query":"query($p: ID!) { issues(projectId: $p, filter: { assignee: \"me\", state: \"started\" }, first: 20) { nodes { key title priority labels { name } children { key state { name } } } pageInfo { hasNextPage endCursor } } }","variables":{"p":"<project id>"}}'
```

```graphql
# Next page: pass endCursor as `after`
query Page($p: ID!, $after: String) {
  issues(projectId: $p, first: 50, after: $after) {
    nodes { key title state { name type } assignee { name } }
    pageInfo { hasNextPage endCursor }
  }
}

# One issue with its whole neighbourhood
query {
  issue(key: "APP-42") {
    title description priority dueDate url
    project { key name }
    parent { key title }
    relations { type issue { key title } }
    comments { body author { name } createdAt }
  }
}

mutation {
  createIssue(input: { projectId: "<project id>", title: "Checkout button misaligned", priority: high }) {
    key url
  }
}

mutation {
  updateIssue(key: "APP-42", input: { stateId: "<done state id>", assigneeId: null, addLabelIds: ["<label id>"] }) {
    key state { name } assignee { name } labels { name }
  }
}

mutation {
  createComment(input: { issueKey: "APP-42", body: "Deployed to staging." }) { id createdAt }
}
```

## OAuth apps (authorization code + PKCE)

Third-party apps can act on a user's behalf without asking for an API key.

1. **Register the app** in **Settings → OAuth apps**: name, redirect URIs (https,
   or http for `localhost`), optional homepage and logo. *Confidential* apps (a
   server) get a client secret — shown once, rotatable; *public* apps (SPA,
   desktop, mobile) get none. The client id is always shown.
2. **Send the user to authorize** (PKCE with `S256` is required for every app):

   ```
   GET https://<your-app>/api/auth/oauth2/authorize
       ?response_type=code
       &client_id=<client id>
       &redirect_uri=<a registered redirect URI>
       &scope=read%20write%20offline_access
       &state=<random>
       &code_challenge=<BASE64URL(SHA256(code_verifier))>
       &code_challenge_method=S256
   ```

   Signed-out users log in first; then they see the consent screen listing the app
   and the requested scopes. Allow redirects to
   `redirect_uri?code=…&state=…&iss=…`; Deny to `redirect_uri?error=access_denied&state=…`.
   Scopes: `read`, `write` (API access), `offline_access` (refresh token), plus the
   OIDC scopes `openid`, `profile`, `email`.
3. **Exchange the code** (within 10 minutes):

   ```bash
   # confidential app: HTTP Basic client auth
   curl -X POST https://your-app.example.com/api/auth/oauth2/token \
     -u "$CLIENT_ID:$CLIENT_SECRET" \
     -d grant_type=authorization_code -d code="$CODE" \
     -d redirect_uri="$REDIRECT_URI" -d code_verifier="$CODE_VERIFIER"

   # public app: no secret, client_id in the body
   curl -X POST https://your-app.example.com/api/auth/oauth2/token \
     -d grant_type=authorization_code -d client_id="$CLIENT_ID" -d code="$CODE" \
     -d redirect_uri="$REDIRECT_URI" -d code_verifier="$CODE_VERIFIER"
   # { "access_token": "…", "token_type": "Bearer", "expires_in": 3600,
   #   "refresh_token": "…", "scope": "read write offline_access" }
   ```

4. **Call the API** with `Authorization: Bearer <access_token>` (REST or GraphQL).
   Access tokens last 1 hour; with `offline_access`, refresh them:

   ```bash
   curl -X POST https://your-app.example.com/api/auth/oauth2/token -u "$CLIENT_ID:$CLIENT_SECRET" \
     -d grant_type=refresh_token -d refresh_token="$REFRESH_TOKEN"
   ```

Don't send a `resource` parameter — access tokens are opaque and only valid for
this API. Revoke a token with `POST /api/auth/oauth2/revoke` (`token=…`, plus the
client credentials). Users can revoke an app any time in **Settings → OAuth apps → Authorized apps**, which
invalidates all of its tokens; deleting an app revokes it for everyone. Metadata:
`/.well-known/oauth-authorization-server/api/auth` and
`/api/auth/.well-known/openid-configuration`.


## Outgoing webhooks

Configured per project in **Settings → Slack & webhooks**. Each event is a
`POST` with a JSON body:

```json
{
  "id": "event id",
  "type": "issue.updated",
  "createdAt": "2026-09-24T12:00:00.000Z",
  "projectId": "…",
  "actor": { "id": "…", "name": "Ada" },
  "issue": {
    "id": "…", "key": "APP-42", "title": "…",
    "state": { "id": "…", "name": "Done", "type": "completed" },
    "priority": "high", "assignee": null, "url": "https://…"
  },
  "data": { "changes": [ { "field": "stateId", "from": { … }, "to": { … } } ] }
}
```

Headers: `X-Webhook-Event` (the type), `X-Webhook-Delivery` (the event id — the
same on every retry, so dedupe on it), `X-Webhook-Attempt` (1, 2, …) and
`X-Webhook-Signature: sha256=<hex>` — the HMAC-SHA256 of the raw body with the
webhook's secret. Verify it before trusting the payload:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, header, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  return header?.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

Deliveries time out after 5 seconds and don't follow redirects. Respond with any
`2xx` to acknowledge; anything else (including timeouts) is a failure and is
**retried** after 1 min, 5 min, 30 min, 2 h and 12 h, then given up (6 attempts in
total). Retries run on the next delivery to the same endpoint, when an admin opens
the integrations settings and in a daily sweep, so the waits are minimums. When an
endpoint is unreachable, the rest of that batch waits a minute without spending an
attempt. The row menu's **Recent deliveries** shows the last 20 deliveries (status,
attempts, next retry, payload) with **Redeliver**. Test deliveries are logged but
never retried. `actor` is `null` for automations and intake-form submissions;
`issue` is `null` for permanently deleted issues (`issue.purged`) and test
deliveries (`webhook.test`).
