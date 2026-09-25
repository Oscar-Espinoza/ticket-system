# B12 — Import from Jira / GitHub Issues

## Goal
Move an existing backlog in from Jira (its CSV export) or a GitHub repo.

## UX
- **Jira** tab: same CSV wizard with the Jira preset — Summary→title, Description,
  Status, Priority (Highest→Urgent, High, Medium, Low, Lowest→Low), Assignee (email
  when the export has it), Labels (repeated columns), Due date, Story Points→estimate,
  Issue key + Created → kept in a description footer (`_Imported from Jira: ABC-12 ·
  created 2024-03-12_`). Help text: "Jira → Filters → Export → CSV (all fields)".
- **GitHub** tab: repo combobox (repos the user can access, project's connected repo
  preselected, or type `owner/name`), "Include closed issues" switch → **Fetch** →
  counts + preview → **Import** with progress + summary. No token → explain: link
  GitHub under Settings → GitHub (link to the project GitHub settings page).

## Data / actions
- `listGitHubRepos(projectId)` → `{ok, repos[], defaultRepo}` or `{ok:false, reason:'no-token'}`
  (`getGitHubToken` read-only use, Octokit per request).
- `fetchGitHubIssues({projectId, repo, includeClosed})` → paginates `issues.listForRepo`
  (per_page 100), drops PRs, cap 500, maps to `ImportRecord` (title, body + link back,
  labels with colours, `closed` flag, assignee email unknown → unassigned).
- Import goes through the same `importIssues` action (chunks of 25): open → default
  state, closed → first completed state; labels created with the GitHub colour.
- Duplicate marker: the issue URL in the footer (`…/issues/12)`), so re-imports skip.

## Files
`src/app/actions/import.ts`, `src/lib/import/*`, `src/components/import/github-import.tsx`.

## Edge cases
Bad repo string / 404 / rate limit → toast with GitHub's message; repo with only PRs →
empty state; token without `repo` scope on private repos → 404 message hints at scope.
Imports emit one `issue.created` per issue (see integration request about bulk noise).
