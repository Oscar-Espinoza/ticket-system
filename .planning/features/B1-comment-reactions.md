# B1 — Comment reactions

## Goal
Lightweight emoji reactions on comments.

## UX
- Fixed set: 👍 👎 ❤️ 🎉 😄 😕 👀 🚀 (`COMMENT_REACTIONS` in `src/lib/timeline.ts`).
- Existing reactions show as pills (emoji + count) under the comment; the
  viewer's own reactions are highlighted. Hover tooltip lists who reacted
  ("Ana, Ben and 2 others").
- A smiley button opens a popover with the 8 emojis; clicking toggles.
- Optimistic toggle; reverts with a toast on failure.

## Data / actions
- `toggleReaction({projectId, commentId, emoji})` in `src/app/actions/comments.ts`
  — `comment` level, emoji must be in the set, comment must belong to a ticket
  of the project. Delete-returning first; if nothing was removed insert
  (`onConflictDoNothing` on the unique (comment, user, emoji) backstops races).
- No activity event (too noisy for history / notifications).
- Reactions arrive with the timeline (`getIssueTimeline`), grouped per emoji in
  set order with reacting user ids; names resolve from project members.

## Edge cases
- Reactions of users no longer in the project still count; tooltip falls back
  to "Former member".
- Deleting a comment cascades its reactions.
