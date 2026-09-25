# B1 — Rich-text / markdown editor

## Goal
One reusable markdown editor + renderer for descriptions, comments, epic
updates and inbox previews. Source of truth stays plain markdown (search,
email, Slack and the API read it as text).

## UX
- `MarkdownEditor`: autosizing textarea (`field-sizing-content`), quiet toolbar
  (bold, italic, inline code, link, bullet / numbered / check list, quote,
  code block) and a Write / Preview toggle. Toolbar edits go through
  `execCommand('insertText')` so native undo keeps working (falls back to
  `onChange` where unsupported).
- Shortcuts inside the field: ⌘B, ⌘I, ⌘E (code), ⌘K (link — `preventDefault`
  keeps the global palette closed because the registry skips handled events),
  ⌘Enter → `onSubmit`, Esc → `onCancel` (or closes the mention menu first).
- `@` opens a caret-anchored member list (mirror-div caret coordinates),
  filtered as you type; ↑/↓, Enter/Tab insert `formatMention(member)`, Esc closes.
- `Markdown` renderer: `react-markdown` + `remark-gfm`, `skipHtml` (no raw HTML),
  safe `urlTransform` (default + `user:` for mentions), external links open in a
  new tab with `rel="noreferrer noopener"`, internal links via `next/link`,
  task-list checkboxes (toggleable when `onToggleTask` is given), mention chips,
  and `KEY-123` auto-links for the current project's key only.

## Files
- `src/components/editor/markdown-editor.tsx` (client)
- `src/components/editor/markdown.tsx` (client — renderer + remark plugins)
- `src/components/editor/text-edits.ts` (pure selection/format helpers)
- `src/components/editor/index.ts` (exports)

## Props (stable, for other agents)
- `MarkdownEditor({ value, onChange, onSubmit?, onCancel?, onBlur?, placeholder?,
  autoFocus?, disabled?, maxLength?, members?, projectId?, ticketKey?, actions?,
  toolbar?, className?, textareaClassName?, ref?, 'aria-label'? })`
- `Markdown({ children, projectId?, ticketKey?, onToggleTask?, className? })`;
  projectId/ticketKey default to `useOptionalProjectData()`.

## Edge cases
- Outside a project route: no mention list, no key linking.
- Mention names containing `]` are stripped by `formatMention`.
- Keys inside code spans, code blocks and existing links are not linked.
