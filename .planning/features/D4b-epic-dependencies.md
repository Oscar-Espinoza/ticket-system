# D4b — Project dependencies (epic relations)

## Goal
Record that one epic blocks another (or is merely related) and see those
dependencies — and scheduling conflicts — on the roadmap.

## UX
- **Epic detail → Overview**: "Dependencies" section with groups "Blocked by",
  "Blocking", "Related" (only non-empty ones), each row: epic glyph, name,
  status, target date, a red "Starts before blocker ends" hint on conflicts,
  and a remove (×) button. "Add dependency" dropdown → Blocked by… / Blocking… /
  Related to… → epic picker (this project's non-archived epics, excluding self
  and epics already related that way).
- **Roadmap**: SVG connectors from the blocker bar's end to the blocked bar's
  start (curved when there's room, elbow when not), arrowhead at the blocked
  bar. A dependency is a *violation* when the blocked epic starts on/before
  the blocker's target date: its connector turns red/dashed, the blocked bar
  gets a red ring and a tooltip, and the toolbar shows "N scheduling
  conflicts". Connectors follow bars live while dragging.

## Data / actions (`src/app/actions/epic-relations.ts`, write level)
- `addEpicRelation({projectId, epicId, otherEpicId, kind: 'blocks'|'blocked_by'|'related'})`
  — normalised to a row `(epicId blocks relatedEpicId)` or `related`. Both epics
  in the project (same-project only for now, keeps visibility simple); no self;
  no duplicates (related checked in both directions; a reverse `blocks` edge is
  a cycle); no cycles (BFS over the project's `blocks` edges from the blocked
  epic back to the blocker).
- `removeEpicRelation({projectId, id})` — scoped through the epic's project.
- Events: `epic.relation_added` / `epic.relation_removed` with `data.summary`
  ("marked Search as blocking Billing").
- Reads: `getEpicDetail` → `relations: EpicRelationRow[]` (kind from this
  epic's point of view); `getProjectEpics` → `dependencies: {id, blockerId, blockedId}[]`.

## Files
`src/app/actions/epic-relations.ts`, new `src/components/epics/epic-relations.tsx`,
`epic-detail.tsx`, `epic-model.ts`, `src/lib/epics.ts`,
`src/components/roadmap/timeline.tsx`, `roadmap-view.tsx`,
`src/app/dashboard/projects/[id]/roadmap/page.tsx`.

## Edge cases
- Archived epics keep their relations but are excluded from the picker and
  roadmap (connectors to undated/archived epics aren't drawn).
- One-sided dates use the stub span, so connectors still land.
- Guests: read-only lists, no add/remove.
