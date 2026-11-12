// Optimistic issue mutations for an issue list (create, update, bulk update,
// archive / trash / restore, one or many) with rollback + toast on failure,
// offline queueing (src/lib/svelte/outbox.svelte.ts) and session undo
// (src/lib/svelte/undo.svelte.ts: ⌘Z / the toast's Undo).
//
// API:
//   const mutations = useIssueMutations(() => issues, { include });
//     - pass the server issues as a GETTER (props change on refresh);
//     - call during component init, inside a project (it reads useProjectData());
//     - `mutations.issues` is reactive (read it in markup / $derived, don't destructure);
//   `options` may also be a getter: useIssueMutations(() => issues, () => ({ include })).

import { untrack } from 'svelte';
import { toast } from 'svelte-sonner';

import { actionErrorText } from '@/lib/action-errors';
import { useProjectData } from '@/lib/components/project/project-data.svelte';
import type { CreateIssueInput, IssueField, IssuePatch, IssueRow } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';
import type { OutboxActionName } from '@/lib/sync/actions';
import {
  isQueued,
  perform,
  setSyncUser,
  useOutboxItems,
  type OutboxCall,
  type OutboxItem,
  type OutboxOverlay,
} from '@/lib/svelte/outbox.svelte';
import { pushUndo, retainUndoHotkey, undoToastAction } from '@/lib/svelte/undo.svelte';
import { defaultNewIssueState, stateTransitionTimestamps } from '@/lib/workflow';

const TEMP_PREFIX = 'temp-';

/** A just-created issue without a server id yet — not editable until confirmed. */
export function isPendingIssue(issue: IssueRow) {
  return issue.id.startsWith(TEMP_PREFIX);
}

export type PatchData = Pick<ProjectData, 'states' | 'labels' | 'members' | 'epics'>;

/**
 * The issue after `patch`, with `state`, `labels`, `assignee` and `waitingOn` objects derived
 * from project data — the client twin of the server's write, used for
 * optimistic updates. Unknown ids leave the related object unchanged / dropped.
 */
export function applyIssuePatch(issue: IssueRow, patch: IssuePatch, data: PatchData): IssueRow {
  const next: IssueRow = { ...issue };
  for (const field of ['title', 'description', 'priority', 'estimate', 'startDate', 'dueDate', 'followUp', 'parentId', 'cycleId', 'sortOrder'] as const) {
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
  if (patch.waitingOnId !== undefined) {
    const member = data.members.find((m) => m.id === patch.waitingOnId);
    next.waitingOn = member ? { id: member.id, name: member.name, image: member.image } : null;
  }
  if (patch.labelIds !== undefined) {
    const ids = new Set(patch.labelIds);
    next.labels = data.labels
      .filter((label) => ids.has(label.id))
      .map(({ id, name, color }) => ({ id, name, color }));
  } else if (patch.addLabelIds !== undefined || patch.removeLabelIds !== undefined) {
    const remove = new Set(patch.removeLabelIds);
    const kept = issue.labels.filter((l) => !remove.has(l.id));
    const added = data.labels
      .filter((l) => patch.addLabelIds?.includes(l.id) && !kept.some((k) => k.id === l.id))
      .map(({ id, name, color }) => ({ id, name, color }));
    next.labels = [...kept, ...added];
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
      case 'waitingOnId':
        return value !== (issue.waitingOn?.id ?? null);
      case 'labelIds': {
        const current = new Set(issue.labels.map((l) => l.id));
        const next = new Set(value as string[]);
        return current.size !== next.size || [...next].some((id) => !current.has(id));
      }
      case 'addLabelIds':
        return (value as string[]).some((id) => !issue.labels.some((l) => l.id === id));
      case 'removeLabelIds':
        return (value as string[]).some((id) => issue.labels.some((l) => l.id === id));
      default:
        return value !== (issue as unknown as Record<string, unknown>)[field];
    }
  });
}

type Op =
  | { type: 'add'; issue: IssueRow }
  | { type: 'patch'; ids: string[]; patch: IssuePatch; data: PatchData }
  | { type: 'upsert'; issues: IssueRow[] };

function reduce(issues: IssueRow[], op: Op): IssueRow[] {
  switch (op.type) {
    case 'add':
      return [op.issue, ...issues];
    case 'patch': {
      const ids = new Set(op.ids);
      return issues.map((i) => (ids.has(i.id) ? applyIssuePatch(i, op.patch, op.data) : i));
    }
    case 'upsert': {
      const byId = new Map(op.issues.map((i) => [i.id, i]));
      const known = new Set(issues.map((i) => i.id));
      return [
        ...op.issues.filter((i) => !known.has(i.id)),
        ...issues.map((i) => byId.get(i.id) ?? i),
      ];
    }
  }
}

type LifecycleFields = Partial<Pick<IssueRow, 'archivedAt' | 'deletedAt'>>;

/**
 * The server rows with this viewer's queued offline ops applied (in queue
 * order), so an unsynced change survives the transition settling, reloads and
 * other tabs.
 */
function withPending(
  issues: IssueRow[],
  outbox: OutboxItem[],
  viewerId: string,
  data: PatchData & Pick<ProjectData, 'project'>,
): IssueRow[] {
  let next = issues;
  for (const item of outbox) {
    const overlay = item.overlay;
    if (item.userId !== viewerId || !overlay) continue;
    if (overlay.kind === 'add') {
      // Placeholders belong to one project's lists; edits match by id.
      if (overlay.issue.projectId === data.project.id) next = reduce(next, { type: 'add', issue: overlay.issue });
    } else if (overlay.kind === 'patch') {
      next = reduce(next, { type: 'patch', ids: overlay.ids, patch: overlay.patch, data });
    } else {
      const ids = new Set(overlay.ids);
      next = next.map((i) => (ids.has(i.id) ? { ...i, ...overlay.fields } : i));
    }
  }
  return next;
}

/** Optimistic op + outbox overlay for an archive / trash state change. */
function lifecycle(issues: IssueRow[], fields: LifecycleFields): { op: Op; overlay: OutboxOverlay } {
  return {
    op: { type: 'upsert', issues: issues.map((i) => ({ ...i, ...fields })) },
    overlay: { kind: 'set', ids: issues.map((i) => i.id), fields },
  };
}

/** Default list scope: active issues (not archived, not in the trash). */
export const isActiveIssue = (issue: IssueRow) => !issue.archivedAt && !issue.deletedAt;

export interface CreateCallbacks {
  /** Queued offline, it receives the placeholder (`isPendingIssue` is true). */
  onSuccess?: (issue: IssueRow) => void;
  /** Without it, failures toast. */
  onError?: (message: string) => void;
}

/** Every successful mutation is undoable (⌘Z / the toast's Undo) — see src/lib/undo.ts. */
export interface IssueMutations {
  /** Server issues with optimistic changes applied, filtered by `include` (reactive getter). */
  readonly issues: IssueRow[];
  create: (input: CreateIssueInput, callbacks?: CreateCallbacks) => void;
  update: (issue: IssueRow, patch: IssuePatch) => void;
  /**
   * Save the collaborative editor's projection of its doc as the description
   * (marked 'collab', so later editors trust the doc over this snapshot).
   */
  saveCollabDescription: (issue: IssueRow, description: string | null) => void;
  bulkUpdate: (issues: IssueRow[], patch: IssuePatch) => void;
  /** Archive (toast with Undo). */
  archive: (issue: IssueRow, onDone?: () => void) => void;
  /** Soft delete — move to trash (toast with Undo). */
  remove: (issue: IssueRow, onDone?: () => void) => void;
  /** Archive several in one server call, one undo entry, one toast. */
  archiveMany: (issues: IssueRow[], onDone?: () => void) => void;
  /** Trash several in one server call, one undo entry, one toast. */
  removeMany: (issues: IssueRow[], onDone?: () => void) => void;
  /** Back out of the archive (undo = archive). Trashed issues use `restore`. */
  unarchive: (issue: IssueRow, onDone?: () => void) => void;
  /** Out of trash / archive. */
  restore: (issue: IssueRow, onDone?: () => void) => void;
}


type Result = { ok: true } | { ok: false; error: string };

/** A queueable server call; `userId` is filled in by the hook. */
type Call<N extends OutboxActionName> = Omit<OutboxCall<N>, 'userId'>;

const FIELD_WORDS: Record<IssueField, string> = {
  title: 'title',
  description: 'description',
  stateId: 'status',
  priority: 'priority',
  estimate: 'estimate',
  startDate: 'start date',
  dueDate: 'due date',
  assigneeId: 'assignee',
  waitingOnId: 'waiting on',
  followUp: 'follow-up',
  parentId: 'parent',
  cycleId: 'cycle',
  epicId: 'epic',
  milestoneId: 'milestone',
  sortOrder: 'order',
  labelIds: 'labels',
  addLabelIds: 'labels',
  removeLabelIds: 'labels',
};

function describePatch(patch: IssuePatch): string {
  const words = [
    ...new Set(
      (Object.keys(patch) as IssueField[])
        .filter((field) => patch[field] !== undefined && FIELD_WORDS[field])
        .map((field) => FIELD_WORDS[field]),
    ),
  ];
  return words.length > 0 ? `${words.join(', ')} change` : 'change';
}

/** The patch that puts `issue`'s touched fields back (the undo of `patch`). */
export function inversePatch(issue: IssueRow, patch: IssuePatch): IssuePatch {
  const inverse: IssuePatch = {};
  for (const field of Object.keys(patch) as IssueField[]) {
    if (patch[field] === undefined) continue;
    if (field === 'assigneeId') inverse.assigneeId = issue.assignee?.id ?? null;
    else if (field === 'waitingOnId') inverse.waitingOnId = issue.waitingOn?.id ?? null;
    else if (field === 'labelIds') inverse.labelIds = issue.labels.map((l) => l.id);
    else if (field === 'addLabelIds' || field === 'removeLabelIds') continue;
    else (inverse as Record<string, unknown>)[field] = (issue as unknown as Record<string, unknown>)[field];
  }
  // Deltas invert add ↔ remove, limited to the labels this issue actually changed.
  const has = (id: string) => issue.labels.some((l) => l.id === id);
  const added = patch.addLabelIds?.filter((id) => !has(id)) ?? [];
  const removed = patch.removeLabelIds?.filter(has) ?? [];
  if (added.length) inverse.removeLabelIds = added;
  if (removed.length) inverse.addLabelIds = removed;
  // A milestone implies its epic; restore the pair together so it stays valid.
  if (patch.epicId !== undefined || patch.milestoneId !== undefined) {
    inverse.epicId = issue.epicId;
    inverse.milestoneId = issue.milestoneId;
  }
  return inverse;
}

// Optimistic ops stay applied over the server rows until their call settles:
// on success the page data has been refreshed by then (outbox.svelte.ts
// refreshes after every successful call), on
// failure the op is dropped — the UI rolls back — and we toast.
//
// Offline (or on a network error) the call is queued in the outbox and counts
// as done: the queued op's overlay keeps the change on screen until it has
// synced, and undo queues behind it.
//
// Each successful change pushes its inverse onto the session undo stack; undoing
// runs the `…Untracked` / `…Patch` variants, so the undo is optimistic and goes
// through the server actions (activity, webhooks) without pushing another entry.

export interface IssueMutationsOptions {
  /**
   * Which issues this list shows. Archive/trash pages pass their own
   * (e.g. `(i) => i.deletedAt !== null`) so restore drops the row there.
   */
  include?: (issue: IssueRow) => boolean;
}

export function useIssueMutations(
  serverIssues: () => IssueRow[],
  options: IssueMutationsOptions | (() => IssueMutationsOptions) = {},
): IssueMutations {
  const data = useProjectData();
  const outbox = useOutboxItems();
  const readOptions = typeof options === 'function' ? options : () => options;

  // The ops applied on top of `base` while their call is in flight.
  let inFlight = $state.raw<Op[]>([]);

  const base = $derived.by(() => {
    const issues = serverIssues();
    const queued = outbox.current;
    return queued.length ? withPending(issues, queued, data.viewer.id, data) : issues;
  });
  const optimistic = $derived(inFlight.reduce(reduce, base));
  const visible = $derived(optimistic.filter(readOptions().include ?? isActiveIssue));

  $effect(() => retainUndoHotkey());
  // Loads the shared outbox and replays what an earlier visit left queued.
  $effect(() => {
    const viewerId = data.viewer.id;
    untrack(() => setSyncUser(viewerId));
  });

  // Calls still running. Ops are kept until *all* pending calls finish, so one
  // call settling never shows its row's server data while another call's
  // refresh is still on the way: they are cleared together when the count
  // drops to 0. By then each call has waited for a page refresh that started
  // after its write (outbox `send`), so `base` already carries every op.
  let pendingCalls = 0;

  /** Apply `op` until every running `task` settles. */
  async function optimistically(op: Op | null, task: () => Promise<void>) {
    pendingCalls += 1;
    if (op) inFlight = [...inFlight, op];
    try {
      await task();
    } finally {
      pendingCalls -= 1;
      if (pendingCalls === 0 && inFlight.length) inFlight = [];
    }
  }

  function run<N extends OutboxActionName>(op: Op, call: Call<N>, onSuccess?: () => void) {
    void optimistically(op, async () => {
      try {
        const result = (await perform({ ...call, userId: data.viewer.id } as OutboxCall<N>)) as Result;
        if (!result.ok) toast.error(actionErrorText(result.error));
        else onSuccess?.();
      } catch {
        toast.error('Something went wrong — the change was not saved.');
      }
    });
  }

  /** Push an undo entry and toast `message` with its Undo action. */
  function announce(undoLabel: string, message: string, undo: () => void) {
    const id = pushUndo(undoLabel, undo);
    toast.success(message, { action: undoToastAction(id) });
  }

  const patchLabel = (patch: IssuePatch, issue: IssueRow) => `${describePatch(patch)} on ${issue.key}`;
  const bulkLabel = (patch: IssuePatch, targets: IssueRow[]) =>
    targets.length === 1 ? patchLabel(patch, targets[0]) : `${describePatch(patch)} on ${targets.length} issues`;

  /** Send `patch` for one issue (callers have already checked it is worth sending). */
  function sendPatch(issue: IssueRow, patch: IssuePatch, onSuccess?: () => void, source?: 'collab') {
    run(
      { type: 'patch', ids: [issue.id], patch, data },
      {
        projectId: issue.projectId,
        action: 'updateIssue',
        args: {
          projectId: issue.projectId,
          id: issue.id,
          patch,
          ...(source ? { descriptionSource: source } : {}),
        },
        overlay: { kind: 'patch', ids: [issue.id], patch },
        label: patchLabel(patch, issue),
      },
      onSuccess,
    );
  }

  /** Captures the undo of `patch` now; the returned function pushes it once the change landed. */
  function undoRecorder(issue: IssueRow, patch: IssuePatch) {
    const inverse = inversePatch(issue, patch);
    return () => {
      const after = applyIssuePatch(issue, patch, data);
      pushUndo(patchLabel(patch, issue), () => patchUntracked(after, inverse));
    };
  }

  /** `update` without an undo entry — what undo itself runs. */
  function patchUntracked(issue: IssueRow, patch: IssuePatch) {
    if (isPendingIssue(issue) || !patchChangesIssue(issue, patch)) return;
    sendPatch(issue, patch);
  }

  function update(issue: IssueRow, patch: IssuePatch) {
    if (isPendingIssue(issue) || !patchChangesIssue(issue, patch)) return;
    sendPatch(issue, patch, undoRecorder(issue, patch));
  }

  function saveCollabDescription(issue: IssueRow, description: string | null) {
    if (isPendingIssue(issue)) return;
    const patch: IssuePatch = { description };
    const recordUndo = undoRecorder(issue, patch);
    // Sent even when it looks unchanged here: the server marks the source.
    sendPatch(
      issue,
      patch,
      () => {
        if (patchChangesIssue(issue, patch)) recordUndo();
      },
      'collab',
    );
  }

  /** `bulkUpdate` without the undo entry; `onSuccess` gets the issues that were actually sent. */
  function bulkPatch(issues: IssueRow[], patch: IssuePatch, onSuccess?: (targets: IssueRow[]) => void) {
    const targets = issues.filter((i) => !isPendingIssue(i) && patchChangesIssue(i, patch));
    if (targets.length === 0) return;
    const ids = targets.map((i) => i.id);
    run(
      { type: 'patch', ids, patch, data },
      {
        projectId: data.project.id,
        action: 'bulkUpdateIssues',
        args: { projectId: data.project.id, ids, patch },
        overlay: { kind: 'patch', ids, patch },
        label: bulkLabel(patch, targets),
      },
      () => onSuccess?.(targets),
    );
  }

  function bulkUpdate(issues: IssueRow[], patch: IssuePatch) {
    bulkPatch(issues, patch, (targets) => {
      // Issues that shared a value share an inverse: one bulk call per group.
      const groups = new Map<string, { patch: IssuePatch; issues: IssueRow[] }>();
      for (const issue of targets) {
        const inverse = inversePatch(issue, patch);
        const key = JSON.stringify(inverse);
        const group = groups.get(key) ?? { patch: inverse, issues: [] };
        group.issues.push(applyIssuePatch(issue, patch, data));
        groups.set(key, group);
      }
      const id = pushUndo(bulkLabel(patch, targets), () =>
        groups.forEach((group) => bulkPatch(group.issues, group.patch)),
      );
      if (targets.length > 1) {
        toast.success(`Updated ${targets.length} issues`, { action: undoToastAction(id) });
      }
    });
  }

  type LifecycleAction = 'archiveIssue' | 'unarchiveIssue' | 'deleteTicket' | 'restoreIssue';

  /**
   * One issue's archive / trash state change, untracked; `onSuccess` is where
   * the public wrappers record undo. Undo itself runs these directly.
   */
  function setLifecycle(
    issue: IssueRow,
    fields: LifecycleFields,
    action: LifecycleAction,
    label: string,
    onSuccess?: () => void,
  ) {
    if (isPendingIssue(issue)) return;
    const { op, overlay } = lifecycle([issue], fields);
    run(
      op,
      {
        projectId: issue.projectId,
        action,
        args: { projectId: issue.projectId, id: issue.id },
        overlay,
        label,
      },
      onSuccess,
    );
  }

  const archiveUntracked = (issue: IssueRow, onSuccess?: () => void) =>
    setLifecycle(issue, { archivedAt: new Date() }, 'archiveIssue', `archiving ${issue.key}`, onSuccess);
  const unarchiveUntracked = (issue: IssueRow, onSuccess?: () => void) =>
    setLifecycle(issue, { archivedAt: null }, 'unarchiveIssue', `unarchiving ${issue.key}`, onSuccess);
  const removeUntracked = (issue: IssueRow, onSuccess?: () => void) =>
    setLifecycle(issue, { deletedAt: new Date() }, 'deleteTicket', `moving ${issue.key} to trash`, onSuccess);
  const restoreUntracked = (issue: IssueRow, onSuccess?: () => void) =>
    setLifecycle(
      issue,
      { archivedAt: null, deletedAt: null },
      'restoreIssue',
      `restoring ${issue.key}`,
      onSuccess,
    );

  function archive(issue: IssueRow, onDone?: () => void) {
    archiveUntracked(issue, () => {
      announce(`archiving ${issue.key}`, `Archived ${issue.key}`, () => unarchiveUntracked(issue));
      onDone?.();
    });
  }

  function unarchive(issue: IssueRow, onDone?: () => void) {
    const unarchived = { ...issue, archivedAt: null };
    unarchiveUntracked(issue, () => {
      pushUndo(`unarchiving ${issue.key}`, () => archiveUntracked(unarchived));
      onDone?.();
    });
  }

  function remove(issue: IssueRow, onDone?: () => void) {
    removeUntracked(issue, () => {
      announce(`moving ${issue.key} to trash`, `Moved ${issue.key} to trash`, () => restoreUntracked(issue));
      onDone?.();
    });
  }

  function restore(issue: IssueRow, onDone?: () => void) {
    const restored = { ...issue, archivedAt: null, deletedAt: null };
    restoreUntracked(issue, () => {
      if (issue.deletedAt) {
        pushUndo(`restoring ${issue.key}`, () => removeUntracked(restored));
      } else if (issue.archivedAt) {
        pushUndo(`restoring ${issue.key}`, () => archiveUntracked(restored));
      }
      onDone?.();
    });
  }

  type LifecycleManyAction = 'archiveIssues' | 'unarchiveIssues' | 'deleteTickets' | 'restoreIssues';

  /** One optimistic op + one server call for several issues' archive / trash state. */
  function lifecycleMany(
    issues: IssueRow[],
    fields: LifecycleFields,
    action: LifecycleManyAction,
    label: string,
    onSuccess?: () => void,
  ) {
    const { op, overlay } = lifecycle(issues, fields);
    run(
      op,
      {
        projectId: data.project.id,
        action,
        args: { projectId: data.project.id, ids: issues.map((i) => i.id) },
        overlay,
        label,
      },
      onSuccess,
    );
  }

  function archiveMany(issues: IssueRow[], onDone?: () => void) {
    const targets = issues.filter((i) => !isPendingIssue(i) && !i.archivedAt);
    if (targets.length <= 1) {
      if (targets[0]) archive(targets[0], onDone);
      return;
    }
    const label = `archiving ${targets.length} issues`;
    lifecycleMany(targets, { archivedAt: new Date() }, 'archiveIssues', label, () => {
      announce(label, `Archived ${targets.length} issues`, () =>
        lifecycleMany(targets, { archivedAt: null }, 'unarchiveIssues', `unarchiving ${targets.length} issues`),
      );
      onDone?.();
    });
  }

  function removeMany(issues: IssueRow[], onDone?: () => void) {
    const targets = issues.filter((i) => !isPendingIssue(i) && !i.deletedAt);
    if (targets.length <= 1) {
      if (targets[0]) remove(targets[0], onDone);
      return;
    }
    const label = `moving ${targets.length} issues to trash`;
    lifecycleMany(targets, { deletedAt: new Date() }, 'deleteTickets', label, () => {
      // Like `remove`'s undo: restore clears the archive flag too.
      announce(label, `Moved ${targets.length} issues to trash`, () =>
        lifecycleMany(
          targets,
          { archivedAt: null, deletedAt: null },
          'restoreIssues',
          `restoring ${targets.length} issues`,
        ),
      );
      onDone?.();
    });
  }

  function create(input: CreateIssueInput, { onSuccess, onError }: CreateCallbacks = {}) {
    const fail = onError ?? ((message: string) => toast.error(message));
    const viewerId = data.viewer.id;
    const state = data.states.find((s) => s.id === input.stateId) ?? defaultNewIssueState(data.states);
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
            startDate: null,
            dueDate: null,
            slaDueAt: null,
            slaBreachedAt: null,
            stateChangedAt: now,
            assignee: null,
            waitingOn: null,
            followUp: null,
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

    void optimistically(placeholder ? { type: 'add', issue: placeholder } : null, async () => {
      try {
        const result = await perform({
          userId: viewerId,
          projectId: data.project.id,
          action: 'createTicket',
          args: { projectId: data.project.id, ...input },
          overlay: placeholder ? { kind: 'add', issue: placeholder } : null,
          label: `creating “${input.title.trim()}”`,
        });
        if (isQueued(result)) {
          // No server id yet, so no undo; the placeholder stays until it syncs.
          if (placeholder) onSuccess?.(placeholder);
          toast('Saved offline — the issue will be created when you reconnect.');
          return;
        }
        if (!result.ok) {
          fail(actionErrorText(result.error));
          return;
        }
        const ticket = result.ticket;
        if (!ticket) {
          toast.success('Issue created');
          return;
        }
        onSuccess?.(ticket);
        announce(`creating ${ticket.key}`, `Created ${ticket.key}`, () => removeUntracked(ticket));
      } catch {
        fail('Something went wrong — the issue was not created.');
      }
    });
  }

  return {
    get issues() {
      return visible;
    },
    create,
    update,
    saveCollabDescription,
    bulkUpdate,
    archive,
    unarchive,
    remove,
    archiveMany,
    removeMany,
    restore,
  };
}
