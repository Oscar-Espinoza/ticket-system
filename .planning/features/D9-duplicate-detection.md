# D9 — Duplicate detection (heuristic, no LLM)

## Goal
Surface issues that look like the one being written or viewed, so people link
or close duplicates instead of filing them twice.

## Engine — `src/lib/similarity.ts` (server-only)
`findSimilarIssues(userId, projectId, {title, description?, excludeIds?, limit?, minScore?})`
→ `SimilarIssue[] {issue: IssueRow, score (0–1), reason, trigram, keywords}`.
- Candidates (index-backed, project + membership scoped, not trashed, not self):
  `title % $title` (GIN `ticket_title_trgm_idx`, pg_trgm default threshold 0.3)
  OR the ticket_search_idx document `@@ websearch_to_tsquery('a or b or …')`
  built from the title's words.
- Score = 0.6·`similarity(title,$title)` + 0.3·title-keyword coverage (share of
  the title's lexemes present in the candidate's title+description) + 0.1·
  description overlap (lexemes of the given description, capped at 10).
  Without a description the weights renormalize. Closed (completed/canceled)
  or archived issues × 0.85, so open ones rank higher but still show.
- Reason: "Very similar title" / "Similar title" / "N of M keywords", joined by " · ".
- Default minScore 0.3, limit 5 (max 20). Title < 3 chars → [].

## Actions — `src/app/actions/similarity.ts` (read level)
- `findPossibleDuplicates({projectId, title, description?})` → up to 3 (new-issue dialog).
- `getSimilarIssues({projectId, ticketId})` → up to 5 for an existing issue; excludes
  itself and every issue already related to it (any relation type).

## UX
- **New-issue dialog**: once the title has ≥ 8 chars, debounced 450 ms, a quiet
  "Possible duplicates" block under the title lists ≤ 3 (state glyph, key,
  title, state name); each opens in a new tab. Stale responses are dropped.
  Hidden when nothing matches or while the title is short.
- **Issue detail `SectionSimilar`**: "Similar issues" section (hidden when empty)
  with compact rows (reason as tooltip). Hover actions: "Mark as duplicate of KEY"
  (B4 `addIssueRelation` kind `duplicate_of` — creates the relation and moves this
  issue to the Duplicate state) and "Dismiss" (per viewer, localStorage keyed by
  issue id). Read-only roles see the list without the duplicate action.
- Components in `src/components/similar/`: `useSimilarIssues` hook, `PossibleDuplicates`.

## Edge cases
Title edits race → sequence guard. Non-member / trashed candidate → never
returned (SQL scope). Action errors → silently no hints (it's advisory).
Dialog closed / no write permission → no requests.
