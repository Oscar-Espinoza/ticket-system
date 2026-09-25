# D1 — Embeds (Figma, YouTube, Loom, Google Docs/Sheets/Slides, Miro)

## Goal
A link to a design / video / doc pasted on its own line shows inline, in the
editor and wherever the `Markdown` renderer shows the text (descriptions,
comments, epic updates, docs), without changing the stored markdown.

## Storage
The bare URL on its own line (its own paragraph). Search, email, Slack and the
API see a normal link. No schema change.

## Allowlist (`src/components/editor/embeds.ts`, pure, shared)
`embedFor(url) → { provider, label, src, aspect } | null`, https only:
- Figma `figma.com/(file|design|proto|board|slides|deck)/…` →
  `https://www.figma.com/embed?embed_host=share&url=<encoded>`
- YouTube `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/` →
  `https://www.youtube-nocookie.com/embed/<id>` (id validated `[\w-]{11}`)
- Loom `loom.com/share/<id>` → `https://www.loom.com/embed/<id>`
- Google `docs.google.com/(document|spreadsheets|presentation)/d/<id>` →
  `/preview` (Slides `/embed`)
- Miro `miro.com/app/board/<id>` → `https://miro.com/app/live-embed/<id>/`
Everything else stays a plain link. Ids are re-validated; the embed src is
always rebuilt from a fixed origin (never the pasted URL verbatim).

## UX
- Editor: pasting an allowlisted URL into an empty paragraph inserts an embed
  block (atom node, selectable, Backspace removes it; caption row with provider
  icon + "Open" link). Elsewhere the paste becomes a normal link.
- Renderer: a paragraph whose only child is an autolinked allowlisted URL
  renders the same `EmbedFrame`.
- `iframe` sandboxed (`allow-scripts allow-same-origin allow-popups
  allow-popups-to-escape-sandbox allow-presentation allow-forms`), lazy,
  `referrerPolicy="strict-origin-when-cross-origin"`, fixed aspect ratio, title.

## Markdown
Block tokenizer matches an allowlisted URL line at a block start followed by a
blank line / end (never cuts a paragraph — same rule as CommonMark, so editor
and renderer agree). `renderMarkdown` writes the original URL back.

## Files
`src/components/editor/embeds.ts`, `embed-frame.tsx`, embed node in
`extensions.ts`, renderer hook in `markdown.tsx`.

## Edge cases
- URL inside a list / quote / with text on the same line → stays a link.
- Private Figma / Docs files show the provider's own sign-in or "no access" UI.
