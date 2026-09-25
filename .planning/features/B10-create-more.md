# B10 — Create more

## Goal
Create several issues in a row without reopening the dialog.

## UX
- "Create more" Switch in the dialog footer (remembered per browser via
  localStorage, try/catch). ⌘/Ctrl+Enter submits from any field.
- With it on: after submit the title/description clear immediately, chosen
  properties stay, focus returns to the title. The optimistic row appears as usual.
- On failure the text comes back and the error shows inline.

## Data
No server change — `mutations.create` as before.

## Files
`src/components/issues/new-issue-dialog.tsx`.

## Edge cases
- Draft id is reset per created issue so the next issue starts a fresh draft.
- Off (default): dialog closes on submit exactly like before; failure reopens it.
