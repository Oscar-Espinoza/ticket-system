# A1 — Archive / trash actions

## Goal
Archive, soft delete (trash), restore and purge — the actions + list
semantics. Archive and trash *pages* are B6's.

## UX
Detail `…` menu: Archive, Move to trash (no confirm — toast with Undo).
Issue lists exclude archived + deleted issues.

## Data / actions
`archive` / `unarchive` set/clear `archivedAt`; `softDelete` sets `deletedAt`;
`restore` clears both; `purge` hard-deletes (admin only). Events:
`issue.archived`, `issue.unarchived`, `issue.deleted`, `issue.restored`,
`issue.purged` (ticketId null — the row is gone; id/key/title in data).
Client: `mutations.archive/remove/restore`; lists pass an `include` predicate so
the same hook drives the archive/trash pages (default: active issues only).
