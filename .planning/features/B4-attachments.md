# B4 — Attachments

**Goal:** upload files and add links to an issue; preview/download securely.

## UX
- Section "Attachments": header with "Link" and "Upload" buttons (write only). The whole section
  is a drop target (dashed highlight while dragging files over it).
- List rows: image thumbnail (32px, lazy) or file-type icon / link icon, name (opens: files via
  `/api/attachments/<id>` in a new tab, links to their URL), meta "1.2 MB · Oscar · 3h ago",
  hover delete (uploader or admin) with confirm-free delete + toast.
- Link form (popover): URL (http/https only) + optional title (defaults to hostname+path).
- Upload progress: pending rows with spinner; failures toast. Multiple files at once.
- Empty + read-only → nothing; empty + write → quiet hint "Drop files here or add a link".

## Data / actions
- Metadata `attachment` (kind file|link, title, url for links, contentType, size, uploader);
  bytes base64 in `attachment_blob` (listings never load them). 5 MB cap per file.
- `POST /api/attachments` (multipart: projectId, ticketId, file) — route handler because
  server actions cap bodies at 1 MB. Authorizes `write`, validates the issue is in the project
  and not deleted, size, content type; batch insert metadata + blob + `updated_at` bump + activity.
- `src/app/actions/attachments.ts`: `getIssueAttachments` (read), `addLinkAttachment` (write),
  `deleteAttachment` (write + uploader-or-admin).
- `GET /api/attachments/[attachmentId]`: session → attachment's ticket's project membership
  (404 when not a member — enumeration-resistant). Correct `Content-Type`,
  `Content-Disposition` inline only for raster images + PDF (HTML/SVG/XML always
  `attachment` and served as octet-stream), `X-Content-Type-Options: nosniff`, CSP sandbox for
  non-PDF, `Cache-Control: private`.
- Events `attachment.added` / `attachment.removed` `{key, title, summary, attachment:{id,kind,title}}`.

## Edge cases
- Vercel caps request bodies at ~4.5 MB; a 413 from the platform maps to "File too large".
- Empty files rejected; file names trimmed to 255 chars; unknown type → application/octet-stream.
- Deleting cascades the blob.
