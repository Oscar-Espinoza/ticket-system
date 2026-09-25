# D4a — Cross-project epics (service side)

## Goal
An issue may point at an epic (and its milestones) owned by **another project in
the same workspace**, as long as the acting user is a member of that other
project too. Everything else (states, labels, cycles, assignee, parent) stays
project-scoped. D4b builds the UI on top of this.

## Rule (enforced in `src/lib/issue-service.ts`)
An epic `E` is *available* to project `P` for user `U` when either
- `E.projectId = P`, or
- `E`'s project and `P` share a non-null `workspaceId` **and** `U` has a
  `project_member` row (any role) in `E.projectId`.

System actors (`userId: null`) only get same-project epics. Archived epics keep
today's behaviour (not rejected by the service; pickers hide them).
Milestones follow their epic: a milestone is valid iff its epic is available.
When an issue changes epic, its milestone is cleared (unchanged behaviour).

## Exports (all in `src/lib/issue-service.ts`, server-only)
```ts
/** SQL predicate over the `epic` table: epic is available to projectId for userId. */
export function epicAvailableTo(projectId: string, userId: string | null): SQL;

export interface AvailableEpic extends EpicSummary {   // EpicSummary from project-data-types
  projectId: string;
  projectName: string;
  ticketKey: string;
  /** false = owned by `projectId` itself. */
  external: boolean;
}

/**
 * Non-archived epics (+ milestones, by sortOrder) an issue of `projectId` may
 * use, for `userId`: the project's own epics first (sortOrder, name), then other
 * workspace projects' epics (project name, sortOrder). [] when userId is not a
 * member of projectId. Callers wrap it in their own server action.
 */
export async function availableEpicsForProject(projectId: string, userId: string): Promise<AvailableEpic[]>;
```

## Where it's used
- `loadContext` (issue-service): epic + milestone lookups use
  `epicAvailableTo(projectId, actorId)` for the *new* value; the issue's
  *current* epic/milestone are still loaded (names for the activity log) even if
  the actor can't see that project anymore.
- `moveIssue` keeps an issue's epic when the epic is available to the target.
- D4b: `PropertyEpic` / epic detail list other projects' epics via a server
  action that calls `availableEpicsForProject(issue.projectId, session.user.id)`.
  Epic detail pages must filter issues per-issue by the viewer's membership.

## Edge cases
- Project leaves the workspace: existing links stay (FK), but new cross-project
  assignments are rejected; the UI should show the epic name only when visible.
- Viewer not a member of the epic's project: the service rejects setting it
  ("Invalid epic."); reading the issue still shows `epicId` (UI hides unknown ids).
