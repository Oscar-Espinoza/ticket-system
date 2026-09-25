'use client';

// Settings › Workflow: the project's states grouped by type, with inline
// add / edit (name, color, description), up/down reordering within a type and
// delete-with-replacement. States come from useProjectData(), which the
// actions refresh by revalidating the project layout.

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import { StateIcon, StatusIcon } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createWorkflowState,
  deleteWorkflowState,
  moveWorkflowState,
  updateWorkflowState,
  type WorkflowStateResult,
} from '@/app/actions/workflow-states';
import {
  STATE_TYPE_LABEL,
  STATE_TYPE_ORDER,
  type StateType,
  type WorkflowState,
} from '@/lib/issue-model';
import { DEFAULT_WORKFLOW_STATES } from '@/lib/workflow';
import { ColorPicker } from './color-picker';

const TYPE_HINT: Record<StateType, string> = {
  triage: 'New issues from intake and integrations wait here for review.',
  backlog: 'Ideas and work not yet planned.',
  unstarted: 'Planned work nobody has started.',
  started: 'Work in progress.',
  completed: 'Done. Counts toward progress.',
  canceled: 'Won’t do, duplicates and other closed-without-doing states.',
};

const typeColor = (type: StateType) =>
  DEFAULT_WORKFLOW_STATES.find((state) => state.type === type)?.color ?? '#9da1a8';

const issuesLabel = (count: number) => `${count} issue${count === 1 ? '' : 's'}`;

export function WorkflowSettings({
  projectId,
  counts,
  canEdit,
}: {
  projectId: string;
  /** Issues per state id (including archived and trashed). */
  counts: Record<string, number>;
  canEdit: boolean;
}) {
  const { states, project } = useProjectData();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<StateType | null>(null);
  const [deleting, setDeleting] = useState<WorkflowState | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {STATE_TYPE_ORDER.map((type) => {
        const ofType = states.filter((state) => state.type === type);
        // An empty triage group only matters to someone who can add the state.
        if (type === 'triage' && ofType.length === 0 && !canEdit) return null;
        const canAdd = canEdit && !(type === 'triage' && ofType.length > 0);
        return (
          <section key={type} aria-labelledby={`workflow-${type}`}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <StatusIcon type={type} size={14} />
              <h2 id={`workflow-${type}`} className="text-sm font-medium">
                {STATE_TYPE_LABEL[type]}
              </h2>
              <span className="truncate text-xs text-muted-foreground">{TYPE_HINT[type]}</span>
              {canAdd && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  aria-label={`Add ${STATE_TYPE_LABEL[type].toLowerCase()} state`}
                  onClick={() => {
                    setEditing(null);
                    setAdding(type);
                  }}
                >
                  <Plus />
                </Button>
              )}
            </div>
            <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
              {ofType.map((state, index) =>
                editing === state.id ? (
                  <StateEditor
                    key={state.id}
                    projectId={projectId}
                    type={type}
                    state={state}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <StateRow
                    key={state.id}
                    projectId={projectId}
                    state={state}
                    count={counts[state.id] ?? 0}
                    canEdit={canEdit}
                    isFirst={index === 0}
                    isLast={index === ofType.length - 1}
                    onEdit={() => {
                      setAdding(null);
                      setEditing(state.id);
                    }}
                    onDelete={() => setDeleting(state)}
                  />
                ),
              )}
              {adding === type && (
                <StateEditor projectId={projectId} type={type} onDone={() => setAdding(null)} />
              )}
              {ofType.length === 0 && adding !== type && (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">
                  No triage state. Add one to review incoming issues before they reach the backlog.
                </li>
              )}
            </ul>
          </section>
        );
      })}

      <DeleteStateDialog
        projectId={projectId}
        state={deleting}
        states={states}
        count={deleting ? (counts[deleting.id] ?? 0) : 0}
        triageEnabled={project.triageEnabled}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function StateRow({
  projectId,
  state,
  count,
  canEdit,
  isFirst,
  isLast,
  onEdit,
  onDelete,
}: {
  projectId: string;
  state: WorkflowState;
  count: number;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const move = (direction: 'up' | 'down') =>
    startTransition(async () => {
      const result = await moveWorkflowState({ projectId, id: state.id, direction });
      if (!result.ok) toast.error(result.error);
    });

  return (
    <li className="group flex min-h-10 items-center gap-2.5 px-3 py-1.5">
      <StateIcon state={state} size={14} />
      <button
        type="button"
        disabled={!canEdit}
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-baseline gap-2 rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
      >
        <span className="shrink-0 text-sm">{state.name}</span>
        {state.description && (
          <span className="truncate text-xs text-muted-foreground">{state.description}</span>
        )}
      </button>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {issuesLabel(count)}
      </span>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-0.5">
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move ${state.name} up`}
                disabled={isFirst}
                onClick={() => move('up')}
                className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 disabled:opacity-0"
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move ${state.name} down`}
                disabled={isLast}
                onClick={() => move('down')}
                className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 disabled:opacity-0"
              >
                <ArrowDown />
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${state.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );
}

function StateEditor({
  projectId,
  type,
  state,
  onDone,
}: {
  projectId: string;
  type: StateType;
  /** Absent = adding a new state of `type`. */
  state?: WorkflowState;
  onDone: () => void;
}) {
  const [name, setName] = useState(state?.name ?? '');
  const [color, setColor] = useState(state?.color ?? typeColor(type));
  const [description, setDescription] = useState(state?.description ?? '');
  const [error, setError] = useState<Extract<WorkflowStateResult, { ok: false }> | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(event?: React.FormEvent) {
    event?.preventDefault();
    startTransition(async () => {
      const result = state
        ? await updateWorkflowState({ projectId, id: state.id, name, color, description })
        : await createWorkflowState({ projectId, type, name, color, description });
      if (!result.ok) {
        setError(result);
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(state ? 'State updated' : `Added “${name.trim()}”`);
      onDone();
    });
  }

  return (
    <li className="px-3 py-2">
      <form
        onSubmit={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDone();
          }
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="flex flex-1 items-center gap-2">
          <ColorPicker value={color} onChange={setColor} label="State color" />
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="State name"
            maxLength={40}
            aria-label="State name"
            aria-invalid={error?.field === 'name' ? true : undefined}
            className="h-7 w-40"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={200}
            aria-label="Description"
            className="h-7 min-w-0 flex-1"
          />
        </div>
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
            {isPending && <Loader2 className="animate-spin" />}
            {state ? 'Save' : 'Add state'}
          </Button>
        </div>
      </form>
      {error?.field && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error.error}
        </p>
      )}
    </li>
  );
}

function DeleteStateDialog({
  projectId,
  state,
  states,
  count,
  triageEnabled,
  onClose,
}: {
  projectId: string;
  state: WorkflowState | null;
  states: WorkflowState[];
  count: number;
  triageEnabled: boolean;
  onClose: () => void;
}) {
  const others = states.filter((s) => s.id !== state?.id);
  const sameType = others.filter((s) => s.type === state?.type);
  const [picked, setPicked] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Default: a sibling of the same type, else the first other state.
  const replacementId = picked ?? sameType[0]?.id ?? others[0]?.id ?? '';

  let blocked: string | null = null;
  if (state?.type === 'triage' && triageEnabled) {
    blocked = 'Triage is on for this project. Turn it off in Cycles & triage settings before deleting the triage state.';
  } else if (state && state.type !== 'triage' && sameType.length === 0) {
    blocked = `Every project needs at least one ${STATE_TYPE_LABEL[state.type].toLowerCase()} state. Add another one before deleting “${state.name}”.`;
  }

  function close() {
    setPicked(null);
    onClose();
  }

  function confirm() {
    if (!state || !replacementId) return;
    startTransition(async () => {
      const result = await deleteWorkflowState({ projectId, id: state.id, replacementId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted “${state.name}”`);
      close();
    });
  }

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{state?.name}”?</DialogTitle>
          <DialogDescription>
            {blocked ??
              (count > 0
                ? `${issuesLabel(count)} use this state. Choose where they should move.`
                : 'No issues use this state.')}
          </DialogDescription>
        </DialogHeader>

        {!blocked && count > 0 && (
          <Select value={replacementId} onValueChange={setPicked}>
            <SelectTrigger className="w-full" aria-label="Move issues to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {others.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <StateIcon state={s} size={14} />
                  {s.name}
                  <span className="text-xs text-muted-foreground">
                    {STATE_TYPE_LABEL[s.type]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {blocked ? 'Close' : 'Cancel'}
          </Button>
          {!blocked && (
            <Button variant="destructive" onClick={confirm} disabled={isPending || !replacementId}>
              {isPending && <Loader2 className="animate-spin" />}
              {count > 0 ? 'Move issues and delete' : 'Delete state'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
