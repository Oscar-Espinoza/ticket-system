# B11 — API keys + public REST API

## Goal
Personal API keys and a small JSON REST API at `/api/v1` acting as the key's user.

## UX
`/dashboard/settings/api-keys`: "Create key" dialog (name) → key shown once with Copy;
table: name, prefix (`lc_abc1234…`), created, last used, Revoke (AlertDialog). Empty state
links to `docs/API.md` content summary.

## Data / actions
- `api_key` rows: key `lc_<base64url 32 bytes>`, store sha256 hex + first 10 chars prefix.
  `src/app/actions/api-keys.ts`: `createApiKey({name})`, `revokeApiKey({id})` (session user
  only, max 25 active keys).
- `src/lib/api-auth.ts`: `authenticateApiRequest(req)` → `{ok,userId,keyId}` or a 401
  `Response`; Bearer parsing, hash lookup (revoked excluded), `lastUsedAt` updated at most
  once a minute via `after()`. Also `apiError(status,msg)`, `readJson(req)`.
- Routes (`src/app/api/v1/**`, helpers in `_lib/`): `GET /me`, `GET /projects`,
  `GET /projects/:id/{states,labels,members,issues}`, `POST /projects/:id/issues`,
  `GET|PATCH|DELETE /issues/:key`, `GET|POST /issues/:key/comments`.
  Every call: key → membership (`requireProjectMember`) → `roleAllows` level
  (read / write / comment). Non-member → 404 (no enumeration), role too low → 403.
  Writes go through `issue-service` with `actor {userId}`; comments reuse B1's session-less
  `createCommentAs` / `loadIssueTimeline` (`src/lib/comments.ts`), which insert, subscribe
  and emit `comment.created`.
- Issue list: filters `state` (id, name or type), `assignee` (id | `me` | `none`),
  `label` (id or name), `updated_since` (ISO), `include_archived`; cursor = issue number,
  `limit` ≤ 100, response `{ issues, nextCursor }`.
- Errors: `{ error, field? }` with 400/401/403/404/405. Rate limiting skipped (optional).

## Docs
`docs/API.md` with curl examples.

## Edge cases
Keys never logged or re-shown. Malformed key/JSON → 401/400. Issue key parsed as
`<KEY>-<n>` case-insensitively; trashed issues readable (with `deletedAt`) but not writable.
