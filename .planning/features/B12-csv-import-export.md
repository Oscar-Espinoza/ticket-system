# B12 — CSV import / export

## Goal
Get issues out of a project (CSV / JSON) and bulk-create issues from any CSV.

## UX
- Settings → Import / export. **Export** card: "Download CSV" / "Download JSON" links
  (any member). **Import** card (write level; guests see a read-only note) with tabs
  CSV · Jira · GitHub.
- CSV wizard: drop/pick file → client parses (RFC-4180: quoted fields, `""`, quoted
  newlines, CRLF, BOM) → **Map columns** (one row per column: header, sample, field
  Select, auto-detected from header synonyms; several columns may map to Labels) →
  **Preview** first 5 normalized rows + counts (rows, rows without title skipped) →
  **Import** in chunks of 25 with a Progress bar → summary (created, duplicates
  skipped, failures with row + reason) and a link to the issues list.

## Data / actions
- `GET /api/projects/[id]/export?format=csv|json` — session + `requireProjectMember`,
  all non-deleted issues (archived included) via `queryIssues`, plus assignee/creator
  emails, cycle/epic/milestone names, parent keys. CSV: BOM, CRLF, RFC-4180 quoting,
  formula-injection guard (`'` before `= + - @ \t \r`; the importer strips it again),
  `Content-Disposition: attachment; filename="KEY-issues-YYYY-MM-DD.csv"`, `no-store`.
- `src/lib/import/csv.ts` parse/serialize; `src/lib/import/mapping.ts` fields, presets,
  auto-detect, `buildRecords(rows, mapping, preset)` → `ImportRecord[]` (client-safe).
- `importIssues({projectId, records})` server action (`src/app/actions/import.ts`):
  `authorizeProjectAction(..,'write')`, ≤25 records per call, validates every field,
  resolves state by name (then status synonyms → first state of that type, then
  default), priority, assignee by **member** email, labels by name case-insensitively
  (creates missing with given/auto colour), estimate snapped to the project scale,
  due date; creates through `issue-service.createIssue({userId: importer})` so
  activity/notifications/webhooks see them. Source footer in the description
  (`_Imported from Jira: ABC-1_`) doubles as the duplicate marker (checked with
  `position()` over the project's tickets, trash included).

## Files
`src/app/api/projects/[id]/export/route.ts`, `src/lib/import/{csv,mapping,records}.ts`,
`src/app/actions/import.ts`, `src/components/import/*`,
`src/app/dashboard/projects/[id]/settings/import-export/page.tsx`.

## Edge cases
Empty file / header only; ragged rows; >5000 rows (refuse, ask to split); title >200
truncated; description trimmed to fit 10k with footer; unknown state/priority/email →
defaults (reported in preview as "defaulted"); label names >40 truncated; Jira repeats
the `Labels` header once per label — mapping is by column index.
