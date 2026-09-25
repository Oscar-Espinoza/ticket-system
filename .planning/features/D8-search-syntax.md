# D8 — Search query syntax

## Goal
One Linear/GitHub-style query language for the global search page, the issues
quick-filter box and dashboard widgets: `label:bug assignee:me -label:wontfix login`.

## Syntax (case-insensitive keys, `"quoted values"`, `a,b` = any-of, `-key:` negates)
- `is:open|closed|archived` · `status:"In Progress"` (state name) · `type:started`
  (state type; `todo`→unstarted, `done`→completed)
- `assignee:me|none|<name>` · `creator:me|<name>` (aliases `assigned:`, `author:`)
- `priority:urgent|high|medium|low|none` · `label:bug` (repeat = all of; `-label:` excludes)
- `project:KEY` (alias `team:`) · `cycle:current|next|previous|none|<number>` · `epic:"name"|none`
- `due:overdue|today|week|next-week|none` · `created:>7d` (older than) / `created:<7d`
  or `created:7d` (within) / `created:>2026-01-01` (after date); units h d w m; same for `updated:`
- `sla:breached|risk|none`
- Everything else is free text (full-text on the search page, title/ID substring in lists).
  Unknown `foo:bar` stays text.

## Data / code
- `src/lib/issue-filtering.ts` (client-safe): `parseSearchQuery(q)` → `{text, terms}`,
  `formatSearchTerm`, `SEARCH_SYNTAX_HELP`; `issueMatcher` parses `filters.q` so every
  view (lists, dashboards) understands the syntax. Cycle/epic terms need
  `FilterContext.cycles/epics` (dashboards pass them); without them they are ignored.
- `resolveSearchTerms(parsed, projectData)` → IssueFilters chips + leftover text. The
  quick-filter box converts on Enter (and cycle/epic terms on commit, since the list
  matcher has no cycle/epic names).
- `src/lib/search.ts`: `searchIssues` turns terms into correlated SQL (EXISTS on
  labels/states/users/cycles/epics, `upper(project.ticketKey)`), all inside the
  membership scope. Filters-only queries (no text) list matching issues by `updatedAt`.
  `is:archived` implies "include archived". Existing `q`/`project`/`archived` URL params keep working.

## UX
Syntax help popover (`?` icon) beside the search inputs listing every key with examples;
clicking an example inserts it. Search page shows parsed filters as small chips.

## Edge cases
Unclosed quote → value runs to end. Empty value (`label:`) → text. Unknown enum values
(`priority:urgentt`) match nothing rather than being ignored (user sees 0 results).
Max 200 chars; ≤ 20 terms.
