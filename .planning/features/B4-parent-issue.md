# B4 — Parent issue

**Goal:** set / change / clear an issue's parent from the properties panel and jump to it.

## UX
- `PropertyParent` renders a `PropertyRow` "Parent" (always, like the other properties).
- Unset: ghost button "Set parent" (git-branch-style icon) → `IssueSearchPicker`.
- Set: state icon + key + title of the parent. Clicking the key/title opens the parent
  (pane: `?issue=KEY`; page variant: `issuePath`). A trailing picker button changes it; the
  picker offers "Remove parent" at the top when one is set.
- Guests (no `write`): read-only link, no picker.

## Data / actions
- Candidates: `mutations.issues` (the project's active issues) minus self and the issue's
  descendants (client-side walk over `parentId`) — the server still rejects self/descendant
  and the error surfaces through `mutations.update`'s toast.
- Write: `mutations.update(issue, { parentId })` → `updateIssue` → issue service
  (validates parent belongs to project, not deleted, no cycle; logs `parentId` change).
- Parent not in the active list (archived): show "Archived / unavailable issue" placeholder
  with the picker still usable.

## Files
- `src/components/issue-detail/slots/property-parent.tsx`
- `src/components/issue-hierarchy/issue-search-picker.tsx` (reusable picker, see below)
- `src/components/issue-hierarchy/open-issue.ts` (`useOpenIssue()` — pane vs page navigation)
- `src/components/issue-hierarchy/tree.ts` (`descendantIds`, `ancestorIds`)

## IssueSearchPicker (shared)
`IssueSearchPicker({ issues, exclude?, value?, onSelect, onClear?, clearLabel?, placeholder?, …PickerPopoverProps })`
and bare `IssueSearchOptions`. Filters by key/title tokens itself (cmdk `shouldFilter={false}`),
exact key match first, caps rendering at 50 rows so large projects stay snappy.

## Edge cases
- Pending (temp) issues are excluded from candidates.
- Parent in trash: service rejects ("Invalid parent issue.").
