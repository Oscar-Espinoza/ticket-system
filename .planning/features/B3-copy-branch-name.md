# B3 — Copy git branch name

## Goal
Linear's ⌘⇧. — copy a stable branch name for the open issue and remember it so
the webhook can match PRs opened from it.

## Format
`<prefix>/<key-lowercase>-<slugified-title>`, whole name capped at 60 chars
(cut on a word boundary, no trailing `-`). Prefix = GitHub login when the viewer
has a token, else the first word of their name slugified (`user` fallback).
Pure helper `branchNameFor(prefix, key, title)` in `src/lib/github/branch.ts`
(client-safe).

## UX
Header dropdown item + ⌘⇧. (registered via `registerHotkeys` while the issue
detail is mounted; both `.` and `>` key values because Shift changes `key` on
some layouts) + palette command. Copies synchronously (clipboard needs the user
gesture), toasts "Copied <name>".

## Data
If `issue.githubBranch` is set, copy that. Otherwise compute, copy, then
`saveBranchName(projectId, ticketId, name)` (write level; validated as a safe
ref ≤ 100 chars; only written when the column is still null — first writer wins)
and `router.refresh()`. Guests copy without persisting.
