# Public REST API (v1)

JSON over HTTPS at `https://<your-app>/api/v1`. A request acts as the user who
owns the API key, with that user's project roles — the API can never see or do
more than the user can in the app.

## Authentication

Create a key in **Settings → API keys**. It is shown once; only a hash is stored.

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
| 401 | Missing, malformed or revoked API key |
| 403 | You are a member, but your role can't do this (e.g. guests can't create issues) |
| 404 | Not found — also returned for projects/issues you are not a member of |
| 500 | Unexpected server error |

Roles: `owner` / `admin` / `member` can read and write; `guest` can read and comment.

## Identifiers

- **Project id** — from `GET /projects`.
- **Issue key** — `KEY-NUMBER`, e.g. `APP-12` (case-insensitive).
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
`dueDate` (`YYYY-MM-DD`), `assigneeId`, `labelIds`, `parentId`, `cycleId`,
`epicId`, `milestoneId`. Every id must belong to the project.

### `GET /issues/:key`

Includes archived and trashed issues (check `archivedAt` / `deletedAt`).

```bash
curl -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/issues/APP-42"
# { "issue": { … } }
```

### `PATCH /issues/:key`

Requires write access. Send only the fields to change; `null` clears a field;
`labelIds` replaces the whole label set. Trashed issues can't be edited (404).

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

Headers: `X-Webhook-Event` (the type), `X-Webhook-Delivery` (the event id) and
`X-Webhook-Signature: sha256=<hex>` — the HMAC-SHA256 of the raw body with the
webhook's secret. Verify it before trusting the payload:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, header, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  return header?.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

Deliveries time out after 5 seconds, don't follow redirects and aren't retried;
the settings page shows each webhook's last status. `actor` is `null` for
automations and intake-form submissions; `issue` is `null` for permanently
deleted issues (`issue.purged`) and test deliveries (`webhook.test`).
