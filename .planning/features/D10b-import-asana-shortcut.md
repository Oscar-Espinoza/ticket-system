# D10b — Import from Asana / Shortcut

## Goal
Bring tasks/stories into a project through the existing chunked import pipeline
(B12): preview → `importIssues` in chunks → summary, duplicates skipped.

## UX
Settings → Import / export → new tabs **Asana** and **Shortcut**:
1. Paste a personal access token (kept in component state only; never stored).
2. Asana: pick workspace → project. Shortcut: pick a workflow or a project.
3. Include completed toggle → Fetch → preview (open / completed / sub-issue counts,
   "capped at 500") → Import N issues.
Token errors show the provider's message ("token rejected").

## Mapping
- Completed (Asana `completed`, Shortcut state type `done`) → first completed
  state; otherwise the Asana section / Shortcut state name (name match, then
  synonyms, else default).
- Assignee by email (Asana `assignee.email`; Shortcut owner → member email).
- Tags / labels → labels (Shortcut hex colours; Asana colour names mapped).
- Due dates (`due_on` / `deadline`), descriptions (`notes` / markdown
  description), estimates (Shortcut).
- Subtasks (Asana `/tasks/:gid/subtasks`; Shortcut `parent_story_id` /
  `sub_task_story_ids`) → sub-issues: `ImportRecord.parent` = the parent's
  source; parents are ordered first; the server resolves the parent by its
  duplicate marker (existing issue or one created earlier in the same run).
- Cap 500 records (`EXTERNAL_IMPORT_CAP`); source footer / duplicate marker like
  other importers (`kind` 'asana' | 'shortcut').

## Files
`src/lib/import/{asana,shortcut}.ts` (server fetchers), `records.ts` (+kinds,
parent), `src/app/actions/import.ts` (actions + parent resolution),
`src/components/import/{asana-import,shortcut-import,token-field}.tsx`,
`import-export-panel.tsx` (tabs).

## Edge cases
- Write permission required for every action (token alone isn't auth).
- Upstream failures → friendly errors (401 → token rejected, 429 → rate limited).
- Parent outside the fetched set → issue imported without a parent.
