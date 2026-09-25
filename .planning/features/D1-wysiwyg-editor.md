# D1 — WYSIWYG editor (slash commands, image paste)

## Goal
Swap the textarea inside `MarkdownEditor` for a Tiptap 3 WYSIWYG editor while
markdown stays the stored format, so every consumer (description, comments,
epic descriptions / updates, initiatives, templates) upgrades with no edits and
the `Markdown` renderer, emails, Slack and the API keep reading plain markdown.

## UX
- Rich mode (default): headings, lists, checklists, quotes, code, links,
  mention chips, inline images, embeds. Footer toolbar (bold, italic, code,
  link, lists, checklist, quote, code block) + a "Markdown" toggle that swaps to
  the old textarea (raw mode, still with toolbar + @mention menu).
- Content the rich editor can't represent (tables, raw HTML, footnotes…) is
  detected on open (parse → serialize → compare the letters/digits) and opens
  in raw mode with a quiet note, so editing never drops text.
- `/` slash menu: Heading 1–3, bulleted / numbered / checklist, quote, code
  block, divider, image (only when an upload target exists), mention, issue.
- `@` members (project data or `members` prop), `#` or `KEY-` issues (the
  `issues` prop/context when given, else a debounced server action
  `suggestIssues` scoped to the project). Menus are rendered inline inside the
  editor root (not portaled) so they work inside the mobile Sheet / dialogs.
  ↑/↓, Enter/Tab pick, Esc closes the menu before `onCancel` fires.
- ⌘Enter → onSubmit, Esc → onCancel, ⌘B/⌘I/⌘E, ⌘K opens the link input.
- Image paste / drop / slash-upload: issue context (`ticketId`) → `POST
  /api/attachments` → `![name](/api/attachments/<id>)`; project context only →
  `POST /api/uploads` → `![name](/api/uploads/<id>)`; neither → images are
  ignored (toast explains). 4 MB, raster images only, toast on failure.

## Markdown fidelity
- `@tiptap/markdown`; mention node re-tokenized as `@[Name](user:ID)`
  (`formatMention`), so tokens round-trip byte-exact.
- Text escaping is tidied (no `&amp;` for a lone `&`, no `\_` inside words) so
  Slack / email bodies stay readable.
- Issue keys stay plain text; the renderer auto-links them as before.

## Contract for D2 (docs + Yjs)
`MarkdownEditor` props gain (all optional):
- `extensions?: AnyExtension[]` — appended after the built-ins (memoize: a new
  array identity rebuilds the editor).
- `history?: boolean` (default true) — pass false with Collaboration.
- `controlled?: boolean` (default true) — false: `value` is ignored, the
  document is owned by an extension (Y.Doc); `onChange` still gets markdown
  snapshots; the Markdown toggle and the length limit are disabled.
- `onEditor?: (editor | null) => void`; `ref` exposes `{ focus(), editor }`.
- `ticketId?`, `issues?` (`EditorIssue[]`), `projectId?`, `ticketKey?`.
`RichEditorProvider` / `useRichEditorContext()` carry `{ projectId?, ticketId?,
issues?, extensions?, history? }` for a subtree; props win over context, which
wins over the current project route. `Markdown` gains `embeds?: boolean`.

## Files
- `src/components/editor/markdown-editor.tsx` (frame, modes, toolbar, footer)
- `rich-editor.tsx`, `raw-editor.tsx`, `suggestion-menu.tsx`, `context.tsx`,
  `extensions.ts` (Tiptap setup), `markdown-io.ts` (parse fixes, output
  tidy, fidelity check), `upload.ts` (client), `actions.ts` (`suggestIssues`),
  `index.ts`
- `src/app/api/uploads/route.ts`, `src/app/api/uploads/[uploadId]/route.ts`,
  `src/lib/uploads.ts`; `slots/description-editor.tsx` passes `ticketId`.

## Edge cases
- External `value` changes (composer clears after submit / restores on
  failure) reset the document without emitting `onChange`.
- `disabled` → read-only editor; `maxLength` → a length filter that blocks
  growing edits but lets programmatic loads through (CharacterCount would
  refuse to load an over-long existing value and show an empty editor).
- Guests can comment: uploads accept `comment` level; attachments need `write`.
- SSR: `immediatelyRender: false`; the frame keeps its min height meanwhile.
