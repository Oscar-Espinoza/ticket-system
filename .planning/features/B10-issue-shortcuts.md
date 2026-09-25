# B10 — Per-issue keyboard shortcuts

## Goal
Change any property of the focused/open issue without the mouse.

## Keys (scope "Issue", registered by `IssueShortcuts`)
`s` status · `p` priority · `a` assignee · `i` assign to me · `l` labels ·
`e` estimate · `⇧D` due date · `⇧A` archive · `⌘⌫` move to trash (confirm) ·
`⌘.` copy ID · `⌘⇧,` copy link · `c` create issue · `⌘Z` undo (global, via undo.ts).

## UX
A small command Dialog anchored centre-top (`top-[15%]`) shows the issue key +
title and the matching `…Options` picker; picking applies via `mutations.update`
and closes (labels stay open as a multi-select). Trash uses an AlertDialog.

## Coordination
- The list binds `s` for its focused row (inline status menu). Mine skips when a
  `[data-issue-row]` is focused and, since the list also falls back to its cursor
  row, re-checks one frame later and stands down if a picker popover opened.
- Registry letters ignore Shift, so single-letter entries guard `!shiftKey`;
  Shift combos (`⇧D`, `⇧A`, `⌘⇧,`) use a small `keydown` listener keyed on
  `event.code` with the registry's guards, listed via passive entries.
- `c`: every mounted `NewIssueDialog` (writers only) registers as a host in
  `productivity/new-issue-bus.ts`, which registers `c` once while any host exists;
  `requestNewIssue(seed?)` opens the newest regular host (IssuesView's dialog) or
  IssueShortcuts' own fallback dialog (permalink page). The topbar's `c` creates a
  project outside projects, navigates to `?create=1` inside projects without a
  host, and stays out of the way when one is registered.
- Write-only actions hidden for read-only roles.

## Files
`src/components/issues/slots/issue-shortcuts.tsx`,
`src/components/productivity/issue-command-dialog.tsx`, `issue-actions.ts`,
`new-issue-bus.ts`, `src/components/topbar-chrome.tsx` (`c` only).
