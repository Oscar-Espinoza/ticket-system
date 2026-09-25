'use client';

// Saved views list (global /dashboard/views and per-project views pages):
// open, star, and — for the owner — edit details or delete.

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers, Loader2, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { deleteView, updateView } from '@/app/actions/views';
import { relativeTime } from '@/components/issues/issue-properties';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LabelChip } from '@/components/ui-icons';
import type { SavedViewSummary } from '@/lib/views';
import { FavoriteButton } from './favorite-button';

export interface ViewListItem extends SavedViewSummary {
  favorited: boolean;
  /** The viewer may share views in this view's project (write access). */
  canShare: boolean;
}

export function viewHref(view: Pick<SavedViewSummary, 'id' | 'projectId'>) {
  return view.projectId
    ? `/dashboard/projects/${view.projectId}/views/${view.id}`
    : `/dashboard/views/${view.id}`;
}

export function ViewList({
  views,
  showProject = true,
}: {
  views: ViewListItem[];
  /** Show the project chip (off on a project's own views page). */
  showProject?: boolean;
}) {
  const [editing, setEditing] = useState<ViewListItem | null>(null);
  const [deleting, setDeleting] = useState<ViewListItem | null>(null);

  return (
    <>
      <ul className="flex flex-col gap-px">
        {views.map((view) => (
          <li
            key={view.id}
            className="group flex items-center gap-2 rounded-md pr-1 hover:bg-accent/40 focus-within:bg-accent/40"
          >
            <Link
              href={viewHref(view)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Layers className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{view.name}</span>
                {view.description && (
                  <span className="truncate text-xs text-muted-foreground">{view.description}</span>
                )}
              </span>
              {showProject && view.projectName && (
                <LabelChip dot={false} className="hidden max-w-40 truncate sm:inline-flex">
                  {view.projectName}
                </LabelChip>
              )}
              {view.shared && (
                <span
                  className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                  title="Shared with project members"
                >
                  <Users className="size-3.5" />
                  <span className="hidden md:inline">Shared</span>
                </span>
              )}
              <span className="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground md:block">
                {view.isOwner ? 'You' : (view.ownerName ?? 'Former member')}
              </span>
              <time
                dateTime={new Date(view.updatedAt).toISOString()}
                title={`Updated ${new Date(view.updatedAt).toLocaleString()}`}
                suppressHydrationWarning
                className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
              >
                {relativeTime(view.updatedAt)}
              </time>
            </Link>
            <FavoriteButton targetType="view" targetId={view.id} initial={view.favorited} />
            {view.isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${view.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => setEditing(view)}>
                    <Pencil />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(view)}>
                    <Trash2 />
                    Delete view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <EditViewDialog key={editing.id} view={editing} onClose={() => setEditing(null)} />
      )}
      <DeleteViewDialog view={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function EditViewDialog({ view, onClose }: { view: ViewListItem; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(view.name);
  const [description, setDescription] = useState(view.description ?? '');
  const [shared, setShared] = useState(view.shared);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updateView({
        id: view.id,
        name,
        description,
        // Only send `shared` when it changed — sharing needs write access.
        ...(shared !== view.shared && { shared }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success('View updated');
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit view</DialogTitle>
          <DialogDescription className="sr-only">Rename or re-describe this view.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-name`}>Name</Label>
            <Input
              id={`${uid}-name`}
              value={name}
              maxLength={80}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-description`}>Description</Label>
            <Textarea
              id={`${uid}-description`}
              value={description}
              maxLength={500}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {(view.canShare || view.shared) && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor={`${uid}-shared`}>Share with project</Label>
              <Switch
                id={`${uid}-shared`}
                checked={shared}
                disabled={!view.canShare}
                onCheckedChange={setShared}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteViewDialog({ view, onClose }: { view: ViewListItem | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!view) return;
    startTransition(async () => {
      const result = await deleteView({ id: view.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted “${view.name}”`);
      onClose();
      router.refresh();
    });
  };

  return (
    <AlertDialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{view?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {view?.shared
              ? 'This view is shared — it disappears for everyone in the project. Issues are not affected.'
              : 'The view is removed. Issues are not affected.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              // Keep the dialog open until the delete settles.
              event.preventDefault();
              confirm();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            Delete view
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
