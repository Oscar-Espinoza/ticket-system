'use client';

import { useEffect, useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';

import {
  archiveIssue,
  bulkUpdateIssues,
  createTicket,
  deleteTicket,
  restoreIssue,
  updateIssue,
} from '@/app/actions/tickets';
import { useProjectData } from '@/components/project/project-data';
import type { CreateIssueInput, IssueField, IssuePatch, IssueRow } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';
import { pushUndo, retainUndoHotkey, undoToastAction } from '@/lib/undo';
import { defaultNewIssueState, stateTransitionTimestamps } from '@/lib/workflow';

const TEMP_PREFIX = 'temp-';

/** A just-created issue without a server id yet — not editable until confirmed. */
export function isPendingIssue(issue: IssueRow) {
  return issue.id.startsWith(TEMP_PREFIX);
}

export type PatchData = Pick<ProjectData, 'states' | 'labels' | 'members' | 'epics'>;

/**
 * The issue after `patch`, with `state`, `labels` and `assignee` objects derived
 * from project data — the client twin of the server's write, used for
 * optimistic updates. Unknown ids leave the related object unchanged / dropped.
 */
export function applyIssuePatch(issue: IssueRow, patch: IssuePatch, data: PatchData): IssueRow {
  const next: IssueRow = { ...issue };
  for (const field of ['title', 'description', 'priority', 'estimate', 'dueDate', 'parentId', 'cycleId', 'sortOrder'] as const) {
    if (patch[field] !== undefined) (next as unknown as Record<string, unknown>)[field] = patch[field];
  }
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.stateId !== undefined) {
    const state = data.states.find((s) => s.id === patch.stateId);
    if (state) {
      Object.assign(
        next,
        { stateId: state.id, state },
        stateTransitionTimestamps(issue.state.type, state.type, issue),
      );
    }
  }
  if (patch.assigneeId !== undefined) {
    const member = data.members.find((m) => m.id === patch.assigneeId);
    next.assignee = member ? { id: member.id, name: member.name, image: member.image } : null;
  }
  if (patch.labelIds !== undefined) {
    const ids = new Set(patch.labelIds);
    next.labels = data.labels
      .filter((label) => ids.has(label.id))
      .map(({ id, name, color }) => ({ id, name, color }));
  }

  let epicId = patch.epicId;
  let milestoneId = patch.milestoneId;
  if (milestoneId) {
    epicId = data.epics.find((e) => e.milestones.some((m) => m.id === milestoneId))?.id ?? epicId;
  }
  if (epicId !== undefined) {
    next.epicId = epicId;
    if (milestoneId === undefined && epicId !== issue.epicId) milestoneId = null;
  }
  if (milestoneId !== undefined) next.milestoneId = milestoneId;

  next.updatedAt = new Date();
  return next;
}

/** Whether `patch` would change anything on `issue` (no-op edits skip the server). */
export function patchChangesIssue(issue: IssueRow, patch: IssuePatch): boolean {
  return Object.entries(patch).some(([field, value]) => {
    if (value === undefined) return false;
    switch (field) {
      case 'assigneeId':
        return value !== (issue.assignee?.id ?? null);
      case 'labelIds': {
        const current = new Set(issue.labels.map((l) => l.id));
        const next = new Set(value as string[]);
        return current.size !== next.size || [...next].some((id) => !current.has(id));
      }
      default:
        return value !== (issue as unknown as Record<string, unknown>)[field];
    }
  });
}

type Op =
  | { type: 'add'; issue: IssueRow }
  | { type: 'patch'; ids: string[]; patch: IssuePatch; data: PatchData }
  | { type: 'upsert'; issue: IssueRow };

function reduce(issues: IssueRow[], op: Op): IssueRow[] {
  switch (op.type) {
    case 'add':
      return [op.issue, ...issues];
    case 'patch': {
      const ids = new Set(op.ids);
      return issues.map((i) => (ids.has(i.id) ? applyIssuePatch(i, op.patch, op.data) : i));
    }
    case 'upsert':
      return issues.some((i) => i.id === op.issue.id)
        ? issues.map((i) => (i.id === op.issue.id ? op.issue : i))
        : [op.issue, ...issues];
  }
}

/** Default list scope: active issues (not archived, not in the trash). */
export const isActiveIssue = (issue: IssueRow) => !issue.archivedAt && !issue.deletedAt;

export interface CreateCallbacks {
  onSuccess?: (issue: IssueRow) => void;
  /** Without it, failures toast. */
  onError?: (message: string) => void;
}

/** Every successful mutation is undoable (⌘Z / the toast's Undo) — see src/lib/undo.ts. */
export interface IssueMutations {
  /** Server issues with optimistic changes applied, filtered by `include`. */
  issues: IssueRow[];
  create: (input: CreateIssueInput, callbacks?: CreateCallbacks) => void;
  update: (issue: IssueRow, patch: IssuePatch) => void;
  bulkUpdate: (issues: IssueRow[], patch: IssuePatch) => void;
  /** Archive (toast with Undo). */
  archive: (issue: IssueRow, onDone?: () => void) => void;
  /** Soft delete — move to trash (toast with Undo). */
  remove: (issue: IssueRow, onDone?: () => void) => void;
  /** Out of trash / archive. */
  restore: (issue: IssueRow, onDone?: () => void) => void;
}


function errorMessage(error: string) {
  return error === 'Forbidden' ? "You don't have permission to do that in this project." : error;
}

type Result = { ok: true } | { ok: false; error: string };

const FIELD_WORDS: Record<IssueField, string> = {
  title: 'title',
  description: 'description',
  stateId: 'status',
  priority: 'priority',
  estimate: 'estimate',
  dueDate: 'due date',
  assigneeId: 'assignee',
  parentId: 'parent',
  cycleId: 'cycle',
  epicId: 'epic',
  milestoneId: 'milestone',
  sortOrder: 'order',
  labelIds: 'labels',
};

function describePatch(patch: IssuePatch): string {
  const words = (Object.keys(patch) as IssueField[])
    .filter((field) => patch[field] !== undefined && FIELD_WORDS[field])
    .map((field) => FIELD_WORDS[field]);
  return words.length > 0 ? `${words.join(', ')} change` : 'change';
}

/** The patch that puts `issue`'s touched fields back (the undo of `patch`). */
export function inversePatch(issue: IssueRow, patch: IssuePatch): IssuePatch {
  const inverse: IssuePatch = {};
  for (const field of Object.keys(patch) as IssueField[]) {
    if (patch[field] === undefined) continue;
    if (field === 'assigneeId') inverse.assigneeId = issue.assignee?.id ?? null;
    else if (field === 'labelIds') inverse.labelIds = issue.labels.map((l) => l.id);
    else (inverse as Record<string, unknown>)[field] = (issue as unknown as Record<string, unknown>)[field];
  }
  // A milestone implies its epic; restore the pair together so it stays valid.
  if (patch.epicId !== undefined || patch.milestoneId !== undefined) {
    inverse.epicId = issue.epicId;
    inverse.milestoneId = issue.milestoneId;
  }
  return inverse;
}

// Optimistic state reverts to the server props when the transition settles: on
// success the action's revalidation already carries the new data, on failure
// the UI rolls back and we toast.
//
// Each successful change pushes its inverse onto the session undo stack
// (src/lib/undo.ts); undoing runs the same functions with `track` off, so the
// undo is optimistic and goes through the server actions (activity, webhooks).
export function useIssueMutations(
  serverIssues: IssueRow[],
  options: {
    /**
     * Which issues this list shows. Archive/trash pages pass their own
     * (e.g. `(i) => i.deletedAt !== null`) so restore drops the row there.
     */
    include?: (issue: IssueRow) => boolean;
  } = {},
): IssueMutations {
  const data = useProjectData();
  const [optimistic, apply] = useOptimistic(serverIssues, reduce);
  const [, startTransition] = useTransition();
  const include = options.include ?? isActiveIssue;

  useEffect(() => retainUndoHotkey(), []);

  function run(op: Op, action: () => Promise<Result>, onSuccess?: () => void) {
    startTransition(async () => {
      apply(op);
      try {
        const result = await action();
        if (!result.ok) toast.error(errorMessage(result.error));
        else onSuccess?.();
      } catch {
        toast.error('Something went wrong — the change was not saved.');
      }
    });
  }

  function update(issue: IssueRow, patch: IssuePatch, track = true) {
    if (isPendingIssue(issue) || !patchChangesIssue(issue, patch)) return;
    const inverse = inversePatch(issue, patch);
    run(
      { type: 'patch', ids: [issue.id], patch, data },
      () => updateIssue({ projectId: issue.projectId, id: issue.id, patch }),
      () => {
        if (!track) return;
        const after = applyIssuePatch(issue, patch, data);
        pushUndo(`${describePatch(patch)} on ${issue.key}`, () => update(after, inverse, false));
      },
    );
  }

  function bulkUpdate(issues: IssueRow[], patch: IssuePatch, track = true) {
    const targets = issues.filter((i) => !isPendingIssue(i) && patchChangesIssue(i, patch));
    if (targets.length === 0) return;
    run(
      { type: 'patch', ids: targets.map((i) => i.id), patch, data },
      () =>
        bulkUpdateIssues({
          projectId: data.project.id,
          ids: targets.map((i) => i.id),
          patch,
        }),
      () => {
        if (!track) return;
        // Issues that shared a value share an inverse: one bulk call per group.
        const groups = new Map<string, { patch: IssuePatch; issues: IssueRow[] }>();
        for (const issue of targets) {
          const inverse = inversePatch(issue, patch);
          const key = JSON.stringify(inverse);
          const group = groups.get(key) ?? { patch: inverse, issues: [] };
          group.issues.push(applyIssuePatch(issue, patch, data));
          groups.set(key, group);
        }
        const label =
          targets.length === 1
            ? `${describePatch(patch)} on ${targets[0].key}`
            : `${describePatch(patch)} on ${targets.length} issues`;
        const id = pushUndo(label, () =>
          groups.forEach((group) => bulkUpdate(group.issues, group.patch, false)),
        );
        if (targets.length > 1) {
          toast.success(`Updated ${targets.length} issues`, { action: undoToastAction(id) });
        }
      },
    );
  }

  function archive(issue: IssueRow, onDone?: () => void, track = true) {
    if (isPendingIssue(issue)) return;
    run(
      { type: 'upsert', issue: { ...issue, archivedAt: new Date() } },
      () => archiveIssue({ projectId: issue.projectId, id: issue.id }),
      () => {
        if (track) {
          const id = pushUndo(`archiving ${issue.key}`, () => restore(issue, undefined, false));
          toast.success(`Archived ${issue.key}`, { action: undoToastAction(id) });
        }
        onDone?.();
      },
    );
  }

  function remove(issue: IssueRow, onDone?: () => void, track = true) {
    if (isPendingIssue(issue)) return;
    run(
      { type: 'upsert', issue: { ...issue, deletedAt: new Date() } },
      () => deleteTicket({ projectId: issue.projectId, id: issue.id }),
      () => {
        if (track) {
          const id = pushUndo(`moving ${issue.key} to trash`, () => restore(issue, undefined, false));
          toast.success(`Moved ${issue.key} to trash`, { action: undoToastAction(id) });
        }
        onDone?.();
      },
    );
  }

  function restore(issue: IssueRow, onDone?: () => void, track = true) {
    if (isPendingIssue(issue)) return;
    const restored = { ...issue, archivedAt: null, deletedAt: null };
    run(
      { type: 'upsert', issue: restored },
      () => restoreIssue({ projectId: issue.projectId, id: issue.id }),
      () => {
        if (track && issue.deletedAt) {
          pushUndo(`restoring ${issue.key}`, () => remove(restored, undefined, false));
        } else if (track && issue.archivedAt) {
          pushUndo(`restoring ${issue.key}`, () => archive(restored, undefined, false));
        }
        onDone?.();
      },
    );
  }

  return {
    issues: optimistic.filter(include),

    create: (input, { onSuccess, onError } = {}) => {
      const fail = onError ?? ((message: string) => toast.error(message));
      const state =
        data.states.find((s) => s.id === input.stateId) ?? defaultNewIssueState(data.states);
      const now = new Date();
      const placeholder: IssueRow | null = state
        ? applyIssuePatch(
            {
              id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
              projectId: data.project.id,
              key: `${data.project.ticketKey}-…`,
              number: 0,
              title: input.title.trim(),
              description: input.description?.trim() || null,
              stateId: state.id,
              state,
              priority: 'none',
              estimate: null,
              dueDate: null,
              assignee: null,
              creator: data.viewer,
              labels: [],
              parentId: null,
              sortOrder: 0,
              cycleId: null,
              epicId: null,
              milestoneId: null,
              githubBranch: null,
              ...stateTransitionTimestamps(
                null,
                state.type,
                { startedAt: null, completedAt: null, canceledAt: null },
                now,
              ),
              archivedAt: null,
              deletedAt: null,
              createdAt: now,
              updatedAt: now,
            },
            { ...input, title: undefined, description: undefined },
            data,
          )
        : null;

      startTransition(async () => {
        if (placeholder) apply({ type: 'add', issue: placeholder });
        try {
          const result = await createTicket({ projectId: data.project.id, ...input });
          if (!result.ok) {
            fail(errorMessage(result.error));
            return;
          }
          const ticket = result.ticket;
          if (!ticket) {
            toast.success('Issue created');
            return;
          }
          onSuccess?.(ticket);
          const id = pushUndo(`creating ${ticket.key}`, () => remove(ticket, undefined, false));
          toast.success(`Created ${ticket.key}`, { action: undoToastAction(id) });
        } catch {
          fail('Something went wrong — the issue was not created.');
        }
      });
    },

    update: (issue, patch) => update(issue, patch),
    bulkUpdate: (issues, patch) => bulkUpdate(issues, patch),
    archive: (issue, onDone) => archive(issue, onDone),
    remove: (issue, onDone) => remove(issue, onDone),
    restore: (issue, onDone) => restore(issue, onDone),
  };
}
