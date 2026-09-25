# D2 — Project documents

## Goal
Specs, RFCs and meeting notes live next to the issues they describe: a Docs tab
per project, a full-width collaborative editor per doc, and links both ways
(doc → epic, issues that mention the doc → "Mentioned in").

## UX
- `/dashboard/projects/[id]/docs`: dense list (icon, title, linked epic chip,
  updated by + relative time), search box (`?q=`, title + content, server
  side ILIKE), Active / Archived toggle, "New doc" split button: Blank / Spec /
  RFC / Meeting notes (palette "New document", "New document from
  template…"). Row menu: Copy link, Archive / Unarchive, Delete… (confirm).
  Empty state explains docs.
- `/dashboard/projects/[id]/docs/[docId]`: breadcrumb "Docs ›", icon picker
  (emoji grid + clear), inline title (Enter → focus body), epic picker, avatars
  of collaborators, "…" menu (copy link, export .md, archive, delete). Body =
  D1 `MarkdownEditor` bound to a Y.Doc (`doc:<id>`, see D2-collaborative-
  editing), full width, no outer box. "Mentioned in" lists issues whose
  description links the doc. Guests get a read-only view.
- Archived docs show a banner with Unarchive.

## Data / actions
- Table `document` (Wave 0). `content` is the markdown snapshot, written by the
  active editor (debounced 1.5 s after local typing, last writer wins).
- `src/lib/documents.ts` (server, membership-gated in SQL):
  `getProjectDocuments(projectId, userId)`, `getDocument(projectId, docId,
  userId)`, `getDocumentBacklinks(projectId, docId, userId)` (issues in projects
  the viewer belongs to whose description contains `/docs/<docId>`),
  `documentsForEpic(epicId, userId)`, `searchDocuments(userId, q, limit?)`.
- `src/app/actions/documents.ts` (write level, ids validated against the doc's
  project): `createDocument`, `updateDocument` (title / icon / epicId),
  `saveDocumentContent`, `archiveDocument`, `unarchiveDocument`,
  `deleteDocument` (also drops `collab_doc` / `collab_update` rows).
- Client-safe `src/components/documents/document-model.ts`: types, templates,
  `documentPath`, icon set, `downloadMarkdown`, `excerptOf`.

## Files
`src/app/dashboard/projects/[id]/docs/page.tsx`, `docs/[docId]/page.tsx`,
`src/lib/documents.ts`, `src/app/actions/documents.ts`,
`src/components/documents/*` (incl. `EpicDocuments` for the epic page).

## Edge cases
- Epic must belong to the doc's project (validated server-side).
- Title trimmed, ≤ 200 chars, empty → "Untitled". Icon ≤ 16 chars.
- Content ≤ 200 k chars. Non-members → notFound (layout) / "Forbidden".
- Not a favorite target (skipped, per brief).
- Integration: epic detail can call `documentsForEpic`; `/dashboard/search`
  can call `searchDocuments` (noted in the final report).
