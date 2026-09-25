# B10 — Issue commands in the command palette

## Goal
Everything the per-issue shortcuts do, discoverable from ⌘K.

## UX
While an issue is focused (sticky: last focused row/card, kept while the palette
has focus) or open, section "Issue APP-12": Change status…, Set priority…,
Assign to…, Assign to me, Add labels…, Set estimate…, Set due date…, Copy ID,
Copy link, Duplicate, Archive, Move to trash. They open the same command dialog /
confirm as the hotkeys (after the palette closes).
Inside a project (write access): "New issue from template: <name>" per template
(section "Templates") and "Create issue" when this page has no other.

## Data
Templates from `templates-store` (one `listTemplates` call per project per session).

## Files
`src/components/issues/slots/issue-shortcuts.tsx` (registration via
`registerPaletteCommands`, ids prefixed `b10-`).

## Edge cases
Commands unregister on unmount / when the target disappears (trashed, filtered out).
