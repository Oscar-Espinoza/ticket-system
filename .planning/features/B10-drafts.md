# B10 — Drafts

## Goal
Never lose a half-written issue: the new-issue dialog autosaves to `issue_draft`,
drafts are listed at `/dashboard/drafts` and resume in their project.

## UX
- Dialog autosaves ~800 ms after the last edit once it has a title or description.
  Footer shows "Saving…" / "Draft saved" + a "Discard" link.
- Closing keeps the draft (toast "Draft saved" with "View drafts"); a successful
  create deletes it. Reopening the dialog in the same page keeps the text.
- `/dashboard/drafts`: dense list (title or "Untitled", project, relative updated
  time) — click opens `/dashboard/projects/<id>?draft=<draftId>`; row `…`/trash
  deletes; "Discard all" (AlertDialog confirm). Empty state when none.

## Data / actions (`src/app/actions/drafts.ts`)
- `saveDraft({projectId, id, title, description, data})` — `write` level; id is a
  client UUID so concurrent saves upsert the same row (`onConflictDoUpdate` limited
  to the same user + project). `data` sanitized by `sanitizeIssueDefaults`
  (shape + every id checked against the project, invalid ids dropped).
- `getDraft({projectId, id})` (read, own drafts only), `deleteDraft({id})`,
  `discardAllDrafts()` — always scoped to the session user.
- List page reads drafts joined with `project_member` so drafts from projects the
  user left disappear.

## Files
`src/app/actions/drafts.ts`, `src/components/productivity/issue-defaults.ts`
(server helper), `src/components/productivity/use-draft-autosave.ts`,
`src/components/issues/new-issue-dialog.tsx`, `src/app/dashboard/drafts/page.tsx`,
`src/components/productivity/drafts-list.tsx`, `IssueShortcuts` (`?draft=` resume).

## Edge cases
- Save in flight while the issue gets created → timer cancelled before submit; the
  delete runs after create success.
- Guests (read only) never autosave. Title capped 200, description 10k.
- `?draft=` for a foreign/missing draft → toast "Draft not found", param removed.
