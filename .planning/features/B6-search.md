# B6 — Full-text issue search

## Goal
`/dashboard/search?q=` — Postgres full-text search over issues and comments in
every project I'm a member of, using the GIN indexes from migration 0003.

## UX
- Autofocused input, debounced (250 ms) `router.replace` so results update as
  you type; project filter (All projects / one) and "Include archived" toggle,
  all in the URL (`q`, `project`, `archived=1`).
- Exact key match (`APP-12`) first, then FTS results by rank.
- Result row: state icon, key, title with highlighted terms, project chip,
  snippet (description or "Comment: …") with `<mark>`ed terms. Links to the
  permalink page.
- Empty query → hint; no results → empty state.
- Palette command "Search issues…" (section Navigation) → `/dashboard/search`.

## Data (`src/lib/search.ts`, one `db.batch`, then `queryIssues` for rows)
- Issues: exactly `to_tsvector('english', coalesce(title,'') || ' ' ||
  coalesce(description,''))` `@@ websearch_to_tsquery('english', q)`, `ts_rank`.
- Comments: `to_tsvector('english', body) @@ query`, best comment per issue.
- Key: `upper(project.ticket_key) = PREFIX and ticket_number = N`.
- Every query: member of the project (EXISTS on project_member), `deleted_at is
  null`, `archived_at is null` unless included, optional project id.
- Snippets via `ts_headline` with private sentinel delimiters (U+E000/U+E001);
  the client splits on them and renders text nodes + `<mark>` (React escapes —
  never `dangerouslySetInnerHTML`).

## Files
`src/app/dashboard/search/page.tsx`, `src/lib/search.ts`,
`src/components/navigation/{search-controls,search-results,highlight}.tsx`,
`src/components/navigation/navigation-commands.tsx`.

## Edge cases
- Stopword-only / punctuation queries → empty tsquery → no FTS rows (no error).
- Query > 200 chars truncated. Merge dedupes issues matched several ways.
