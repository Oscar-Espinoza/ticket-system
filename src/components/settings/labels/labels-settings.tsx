'use client';

// Settings › Labels: search, create, inline edit and delete. Labels come from
// useProjectData(); src/app/actions/labels.ts revalidates the project layout,
// so the list refreshes itself after every change.

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, MoreHorizontal, Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import type { ProjectLabel } from '@/lib/project-data-types';
import { EmptyState } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createLabel, deleteLabel, updateLabel, type LabelActionResult } from '@/app/actions/labels';
import { ColorPicker, PRESET_COLORS } from '@/components/settings/workflow/color-picker';

const issuesLabel = (count: number) => `${count} issue${count === 1 ? '' : 's'}`;

export function LabelsSettings({
  projectId,
  counts,
  canEdit,
}: {
  projectId: string;
  /** Active issues per label id. */
  counts: Record<string, number>;
  canEdit: boolean;
}) {
  const { labels } = useProjectData();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ProjectLabel | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter(
      (label) =>
        label.name.toLowerCase().includes(q) || label.description?.toLowerCase().includes(q),
    );
  }, [labels, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter labels…"
            aria-label="Filter labels"
            className="pl-8"
          />
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setAdding(true);
            }}
          >
            <Plus />
            New label
          </Button>
        )}
      </div>

      {labels.length === 0 && !adding ? (
        <EmptyState
          icon={<Tag />}
          title="No labels yet"
          description="Labels categorize issues across states — Bug, Feature, Design. Create one here or from any issue’s label picker."
          action={
            canEdit ? (
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus />
                New label
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
          {adding && <LabelEditor projectId={projectId} onDone={() => setAdding(false)} />}
          {visible.map((label) =>
            editing === label.id ? (
              <LabelEditor
                key={label.id}
                projectId={projectId}
                label={label}
                onDone={() => setEditing(null)}
              />
            ) : (
              <LabelRow
                key={label.id}
                label={label}
                count={counts[label.id] ?? 0}
                canEdit={canEdit}
                onEdit={() => {
                  setAdding(false);
                  setEditing(label.id);
                }}
                onDelete={() => setDeleting(label)}
              />
            ),
          )}
          {visible.length === 0 && labels.length > 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No labels match “{query.trim()}”.
            </li>
          )}
        </ul>
      )}

      {labels.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {labels.length} label{labels.length === 1 ? '' : 's'}
        </p>
      )}

      <DeleteLabelDialog
        projectId={projectId}
        label={deleting}
        count={deleting ? (counts[deleting.id] ?? 0) : 0}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function LabelRow({
  label,
  count,
  canEdit,
  onEdit,
  onDelete,
}: {
  label: ProjectLabel;
  count: number;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex min-h-10 items-center gap-2.5 px-3 py-1.5">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
        aria-hidden="true"
      />
      <button
        type="button"
        disabled={!canEdit}
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-baseline gap-2 rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
      >
        <span className="shrink-0 text-sm">{label.name}</span>
        {label.description && (
          <span className="truncate text-xs text-muted-foreground">{label.description}</span>
        )}
      </button>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {issuesLabel(count)}
      </span>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${label.name}`}>
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
      )}
    </li>
  );
}

function LabelEditor({
  projectId,
  label,
  onDone,
}: {
  projectId: string;
  /** Absent = creating a new label. */
  label?: ProjectLabel;
  onDone: () => void;
}) {
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(
    () => label?.color ?? PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
  );
  const [description, setDescription] = useState(label?.description ?? '');
  const [error, setError] = useState<Extract<LabelActionResult, { ok: false }> | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = label
        ? await updateLabel({ projectId, id: label.id, name, color, description })
        : await createLabel({ projectId, name, color, description });
      if (!result.ok) {
        setError(result);
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(label ? 'Label updated' : `Created “${name.trim()}”`);
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
          <ColorPicker value={color} onChange={setColor} label="Label color" />
          <Input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Label name"
            maxLength={40}
            aria-label="Label name"
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
            {label ? 'Save' : 'Create label'}
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

function DeleteLabelDialog({
  projectId,
  label,
  count,
  onClose,
}: {
  projectId: string;
  label: ProjectLabel | null;
  count: number;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function confirm() {
    if (!label) return;
    startTransition(async () => {
      const result = await deleteLabel({ projectId, id: label.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Deleted “${label.name}”`);
      onClose();
    });
  }

  return (
    <AlertDialog open={label !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{label?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {count > 0
              ? `It will be removed from ${issuesLabel(count)}. This can’t be undone.`
              : 'No issues use this label. This can’t be undone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={isPending}>
            Delete label
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
