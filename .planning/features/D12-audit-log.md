# D12 — Audit log + export

## Goal
Admins review and export who did what: issue/project events already in
`activity`, member/role changes, and new security events (2FA, SSO, SCIM,
exports).

## UX
- **Project settings → Audit log** (project owner/admin) and
  **Workspace → Audit log** (`/dashboard/workspaces/[slug]/audit`, workspace
  owner/admin; project events only from teams the viewer administers + all
  workspace security events). Links from the workspace header for admins.
- Filter bar (URL-driven, server-rendered): actor (members + "System"),
  category (Issues, Comments, Members & roles, Security, Integrations), from /
  to dates, issue key. Dense table: time, actor, category chip + summary,
  team (workspace scope), issue link. 100 rows per page, "Older" cursor link.
- **Export CSV / JSON** buttons → `GET /api/audit?scope=project|workspace&id=…&format=csv|json&from&to`
  (+ same filters). Streamed in 1 000-row chunks, capped at 50 000 rows,
  admins only (404 otherwise), `Cache-Control: no-store`; records a
  `security.audit_exported` event.

## Data
- `src/lib/audit.ts`: scope resolution + authorization, `auditWhere(filters)`,
  `queryAuditPage`, `describeAuditEvent` (plain-text summary), categories,
  `recordSecurityEvent` / `recordUserSecurityEvent`.
- Workspace-level events are stored once on the workspace's first project with
  `data.scope = 'workspace'` and `data.workspaceId` (activity.projectId is
  NOT NULL); queries include them for every project of that workspace.
- Security events are inserted directly (no Slack/webhook fan-out).

## Files
`src/lib/audit.ts`, `src/app/api/audit/route.ts`, `src/components/audit/*`,
`src/app/dashboard/projects/[id]/settings/audit/page.tsx`,
`src/app/dashboard/workspaces/[slug]/{audit,page}.tsx`.

## Edge cases
- Dates are YYYY-MM-DD, inclusive, UTC. Invalid filters are ignored.
- Deleted actors show "Deleted user"; null actor = "System".
- CSV cells go through the formula-injection guard (`toCsv`).
