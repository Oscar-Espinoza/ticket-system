# D9 — Triage suggestions (heuristic, no LLM)

## Goal
When reviewing an issue in triage, suggest labels, assignee, priority and a
likely duplicate from how similar past issues were handled.

## Data
- `getTriageSuggestions({projectId, id})` in `src/app/actions/triage.ts` (read
  level; issue must be in the project and in triage). Loads the k = 8 most
  similar issues (`findSimilarIssues`, minScore 0.25) and the project's labels
  and members, then calls the pure `suggestTriage()` in `src/lib/triage.ts`.
- Neighbours for property votes = similar issues NOT in triage (already curated).
  Votes are weighted by similarity score:
  - labels: weight share per label ≥ 0.4 and ≥ 2 supporting issues; only labels
    that still exist; max 3.
  - assignee: weighted-most-frequent assignee who is still a project member;
    share ≥ 0.4 and ≥ 2 issues.
  - priority: weighted vote over neighbours with a priority set; share ≥ 0.45, ≥ 2.
  - duplicate: best match with score ≥ 0.55 that is not canceled.
- Each suggestion carries `confidence` and `basedOn: {id,key,title}[]`.

## UX (`src/components/triage/triage-suggestions.tsx`)
- A compact strip above the list/preview for the selected issue: "Suggested"
  chips — label chips, assignee avatar, priority icon, "Duplicate of KEY" —
  each one-click Apply (tooltip: "Based on APP-12, APP-40 · 72%"). "Apply all"
  (`a`) applies labels + assignee + priority in one update; the duplicate is
  explicit only (it closes the issue).
- Suggestions already matching the issue (after an apply or manual edit) hide
  themselves; when none remain the strip disappears. Loading: nothing rendered
  (avoids jumps). Results cached per issue id for j/k navigation.
- Writes: `mutations.update(issue, {addLabelIds | assigneeId | priority})` (issue
  service, undoable); duplicate → the existing `markTriageDuplicate` flow.
- Read-only roles: no strip.

## Edge cases
No similar history → no strip. Suggested assignee left the project → skipped.
Label deleted since → skipped. Issue left triage meanwhile → action returns
error → no strip.
