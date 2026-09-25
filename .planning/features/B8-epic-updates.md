# B8 — Epic updates / health status

## Goal
Linear "project updates": authors post a short status update with a health
(on track / at risk / off track); the latest one sets the epic's health.

## UX
- Epic → "Updates" tab: composer at top (health segmented control, markdown body,
  ⌘Enter to post), then the feed newest first: health chip, author avatar + name,
  relative time (absolute in tooltip), rendered markdown. Author (or project admin)
  can delete their update.
- Epic sidebar + epics list show the current health chip; Overview shows the
  latest update excerpt with a link to the Updates tab.
- Health can also be set directly from the sidebar picker (no update posted).

## Data / actions
- `postEpicUpdate({projectId, epicId, health, body})` — write level; body 1–10 000
  chars; `db.batch([insert epic_update, update epic.health/updatedAt])`; emits a
  project-level event `epic.update_posted` (ticketId null, `data.summary`,
  epicId, epicName, health) so Slack / webhooks can relay it.
- `deleteEpicUpdate({projectId, id})` — author or admin; health is recomputed from
  the newest remaining update (kept as-is when none remain).
- Reads: `getEpicDetail` returns updates with authors (newest first, limit 50).

## Edge cases
- Guests cannot post (write level). Deleted author → "Someone".
- Markdown is rendered without raw HTML (react-markdown default / B1 renderer).
