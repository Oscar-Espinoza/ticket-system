# B8 — Milestones

## Goal
Break an epic into ordered checkpoints with target dates and their own progress;
issues can be assigned to one milestone of their epic.

## UX
- Epic Overview → "Milestones" section: rows with a diamond glyph, name (inline
  rename on click / Enter), target date picker, progress "% · n/m", row menu
  (Move up / Move down / Delete). `Alt+↑/↓` on a focused row reorders; an
  "Add milestone" inline input (Enter = create, Esc = cancel).
- Issue detail → "Milestone" picker under "Epic" (see B8-epics).
- Roadmap → milestones render as diamonds on the epic's bar row.

## Data / actions (`src/app/actions/epics.ts`)
- `createMilestone({projectId, epicId, name, targetDate?})` — epic must belong to
  the project; sortOrder = max + 1.
- `updateMilestone({projectId, id, name?, targetDate?, description?})`.
- `deleteMilestone({projectId, id})` — tickets' `milestone_id` is `set null` by FK.
- `reorderMilestones({projectId, epicId, ids})` — ids must be exactly the epic's
  milestones; rewrites sortOrder = index in one `db.batch`.
- All `authorizeProjectAction(projectId, 'write')`; every milestone is joined to
  an epic of that project before writing. Progress per milestone from SQL
  (same rule as epics).

## Edge cases
- Name 1–80 chars; date must be a real YYYY-MM-DD.
- Reorder with a stale list (someone added one meanwhile) → error toast + refresh.
- Optimistic reorder/rename with rollback on failure.
