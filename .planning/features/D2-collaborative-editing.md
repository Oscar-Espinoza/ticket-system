# D2 — Collaborative real-time editing (Yjs over Postgres)

## Goal
Several people edit a document or an issue description at once and see each
other's text and carets, with no websocket server ($0 on Vercel Hobby).

## Transport — long-poll (chosen over SSE)
- `GET /api/collab/[key]?sv=<b64>` → `{ update, lastId, awareness[] }`: full
  sync — diff of the merged state (`collab_doc` + all `collab_update`) against
  the client's state vector, plus recent awareness.
- `GET /api/collab/[key]?after=<id>&client=<cid>` → long-poll: re-checks every
  600 ms for up to ~20 s, returns `{ updates[], awareness[], lastId }` as soon as
  rows newer than `after` (from other clients) exist. Long-poll keeps POST and
  GET symmetric and needs no stream plumbing; latency ≈ 0.3–0.6 s.
- `POST /api/collab/[key]` `{ client, update?, awareness?, seed? }` → `{ id }` /
  `{ seeded }`. Appends one merged client update (base64, ≤ 2 MB).
- Keys: `doc:<documentId>`, `issue:<ticketId>`. Every request: session →
  one query resolving the key's project + the viewer's role. GET needs read,
  POST write (guests are read-only). Unknown / foreign keys → 404.

## Awareness (cursors, names, colors)
Not in-memory (serverless instances don't share memory): awareness updates are
rows in the same `collab_update` table under key `aw:<key>`, so one `after`
cursor covers both streams. Rows older than 60 s are pruned on each awareness
write; compaction never touches them. Local state renews every 15 s
(y-protocols Awareness), remote states expire after 30 s. The server stamps
`user {id, name, image}` from the session (no spoofed names) and validates
every update (`Y.decodeUpdate`, scratch Awareness) before storing it. Alone in
a doc, cursor moves aren't sent (heartbeat only); a newcomer triggers an
immediate send. Doc updates are batched ~120 ms and merged while one POST is
in flight.

## Compaction
After ~1 in 10 appends: if the key has > 200 updates older than 2 min, merge
them into `collab_doc.stateBase64` (`Y.mergeUpdates`) with a compare-and-set on
`updated_at`, then delete exactly the merged rows in the same batch. Clients
re-run a full state-vector sync every 60 s and after any gap > 45 s, which
also heals rows that committed out of id order.

## Client — `src/lib/collab/provider.ts`
`CollabProvider(key, user)`: Y.Doc + Awareness, snapshot `{status
(connecting | synced | offline | error), synced, empty, canWrite, pending}`, pending local updates
merged and POSTed one request at a time with backoff retry, long-poll loop
while visible (paused when hidden, resync on return). `useCollab(key, opts)`
builds provider + Tiptap `Collaboration` / `CollaborationCaret` extensions.

## Seeding + markdown snapshot
- Empty key (no doc, no updates) + non-empty markdown: the first client builds
  the seed (markdown → editor schema → `prosemirrorJSONToYXmlFragment` on a
  scratch Y.Doc) and POSTs `seed: true`; the server inserts `collab_doc` only
  if the key has no doc and no updates. Only an accepted seed is applied
  locally; rejected → the client catches up with the winner's. Local pushes
  wait while a seed is in flight.
- Issue: the description is the source of truth for outside edits (API, Slack,
  raw mode). On open, if the synced text differs from `issue.description` and
  nobody else is in the doc, the editor content is replaced from the
  description (as a Yjs change). Descriptions the rich editor can't represent
  (tables, HTML) skip collaboration and use the single-user editor.
- The editor mounts hidden right after the first sync (its schema builds the
  seed / checks fidelity) and is revealed once reconciled; until then the
  stored markdown renders read-only, so nothing flashes empty.
- Saves: only local (non-remote) transactions mark the doc dirty; 1.5 s after
  typing stops → `mutations.update(issue, { description })` (issue) or
  `saveDocumentContent` (doc). Flushed on close / unmount.
- Failure before the first sync → status `error` → the description editor
  falls back to D1's single-user editor; docs show the saved markdown
  read-only ("Live editing is unavailable"). After a sync, failures are
  `offline`: edits stay queued and retry with backoff.

## Files
`src/lib/collab/{codec,keys,store,provider}.ts`,
`src/app/api/collab/[key]/route.ts`, `src/components/collab/{use-collab,
use-collab-editor,collab-avatars}`,
`src/components/issue-detail/slots/description-editor.tsx`.
