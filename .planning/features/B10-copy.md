# B10 — Copy issue link / ID

## Goal
Linear-style copy shortcuts on the focused or open issue.

## UX
- ⌘. → copies `APP-12`; ⌘⇧, → copies the absolute permalink
  (`issueUrl(projectId, key)`); toast "Copied APP-12" / "Copied link".
- Issue `…` menu (`MenuExtraItems`; Copy ID / Copy link already live in the frozen
  host): Copy as markdown link (`[APP-12: Title](url)`), Duplicate issue (same
  text + properties via `mutations.create`), Save as template.
- Palette: "Copy ID", "Copy link" in the "Issue APP-12" section.

## Target resolution
Focused `[data-issue-row]` / `[data-board-card]` → that issue; otherwise the open
issue (`selectedIssue`). No target → key passes through.

## Files
`src/components/productivity/issue-actions.ts` (copy helpers + target lookup),
`issue-shortcuts.tsx`, `menu-extra-items.tsx`.

## Edge cases
Clipboard denied → error toast. ⌘⇧, uses `event.code === 'Comma'` (layout-safe);
it isn't expressible in the registry, so a tiny listener handles it and a passive
registry entry lists it in the `?` overlay.
