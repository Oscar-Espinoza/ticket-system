# B1 — @mentions

## Goal
Mention teammates in comments and descriptions; mentioned people are
subscribed and notified (B2's dispatcher reads `data.mentions`).

## Token
Canonical form from `src/lib/mentions.ts`: `@[Display Name](user:USER_ID)` —
readable as raw text, id survives renames. Existing exports stay stable.

## UX
- Typing `@` in any `MarkdownEditor` opens a member list at the caret
  (project members from `useProjectData().members`), filtered by name.
- Rendered as a chip (`@Name`) by `Markdown`; `user:` links never become
  anchors, so they can't be abused as links.

## Server
- Comments: `extractMentionIds(body)` ∩ project members → `comment.created`
  `data.mentions`; edits send only newly added ids in `comment.updated`.
- Description: after the description save, the client calls
  `announceDescriptionMentions({projectId, ticketId, previous, next})`
  (`src/app/actions/comments.ts`, `write` level). The server computes
  `newMentionIds(previous, next)` ∩ members, minus the actor, subscribes them
  and emits `description.mentioned` `{ key, title, mentions, excerpt, summary }`.
  The client-sent `previous` can only cause notifications for people actually
  mentioned in `next`, which a writer could produce anyway by editing.
- Mentioned users are auto-subscribed (`ensureSubscribed`).

## Edge cases
- Mentioning non-members or unknown ids is ignored server-side.
- Self-mentions don't notify (B2 skips the actor too).
- The timeline hides `comment.*` / `description.mentioned` rows (the comment or
  the "updated the description" line already represents them).
