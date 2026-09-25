# B3 — Magic words in commits / PRs

## Goal
`Fixes APP-12`, `closes app-3, APP-4` close issues on merge; `Ref APP-5`,
`part of APP-6` only link.

## Parser (`src/lib/github/references.ts`, pure)
`findReferences(text, ticketKey)` → `{ number, closing, nonClosing }[]`:
- key token: `\b<KEY>-(\d+)\b`, case-insensitive, only the project's key.
- closing: `close[sd]? | fix(e[sd])? | resolve[sd]?`, optional `:`, then a key
  list joined by `,` / `and` / `&`.
- non-closing: `ref(s)? | references? | part of | related to | contributes to |
  towards`, same list shape.
PR classification:
- auto (moves state on open/merge): keys in the head branch (or issues whose
  stored `githubBranch` equals it), title keys unless non-closing, closing refs
  in title/body.
- link only: other body mentions and non-closing refs.
Commits on the default branch: only closing refs act.

## Edge cases
Unknown numbers / other projects' keys ignored; duplicates merged (closing
wins over plain). Parser is regex-only, no markdown awareness (acceptable).
