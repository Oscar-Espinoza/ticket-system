# B1 — Comments

## Goal
Discussion on an issue, rendered inside the activity timeline, with one level
of threaded replies, edit / delete and permalinks.

## UX
- Composer at the bottom of the Activity section (`MarkdownEditor`, ⌘Enter to
  send). Optimistic append; on failure the comment is removed, the draft
  restored and a toast shown.
- Each comment: avatar, author, relative time (absolute in a tooltip),
  "edited" marker, reactions row, "Reply" and a ⋯ menu (Copy link, Edit,
  Delete). Replies are indented under their root; "Reply" opens an inline
  composer under the thread.
- Edit inline (Save / Cancel, ⌘Enter / Esc). Delete asks for confirmation
  (AlertDialog); deleting a root removes its replies (FK cascade).
- Permalink: `#comment-<id>` anchor; opening a URL with that hash scrolls to and
  highlights the comment once the timeline loads.

## Data / actions (`src/app/actions/comments.ts`, service `src/lib/comments.ts`)
- `createComment({projectId, ticketId, body, parentId?})` — `comment` level;
  ticket must be in the project; parent must be on the same ticket (a reply to
  a reply attaches to the root). Mentions filtered to project members. Author
  + mentioned users → `ensureSubscribed`. Emits `comment.created`
  `{ key, title, commentId, parentId, excerpt, mentions, summary }`.
- `updateComment({projectId, commentId, body})` — author only; sets `editedAt`;
  newly added mentions are subscribed and sent in `comment.updated`
  `{ …, mentions }` (only the new ones).
- `deleteComment({projectId, commentId})` — author, or admin level. Emits
  `comment.deleted`.
- The service functions take an explicit actor so the public API (B11) can
  reuse `createCommentAs(actor, …)` without a session.

## Edge cases
- Body trimmed, 1–10 000 chars. Unknown / cross-project ids → "Comment not found."
- Author deleted (authorId null) → "Deleted user".
- Guests may comment (role level `comment`) but can only edit/delete their own.
