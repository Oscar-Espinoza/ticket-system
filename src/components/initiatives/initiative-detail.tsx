'use client';

// Initiative page: editable name / description, property sidebar, linked
// epics (add / remove — each relink is authorized against the epic's project)
// and a read-only mini timeline of those epics.

import { useOptimistic, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronRight, MoreHorizontal, Plus, Trash2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteInitiative,
  setEpicInitiative,
  updateInitiative,
  type InitiativeInput,
} from '@/app/actions/initiatives';
import { EpicIcon, EpicStatusIcon, HealthChip } from '@/components/epics/epic-glyphs';
import { EPIC_DESCRIPTION_MAX, EPIC_STATUS_LABEL, epicPath } from '@/components/epics/epic-model';
import { DatePicker, MemberPicker } from '@/components/epics/epic-pickers';
import { EpicProgress, ProgressBlock } from '@/components/epics/epic-progress';
import { RichText, RichTextEditor } from '@/components/epics/rich-text';
import { PropertyRow } from '@/components/issue-detail/property-row';
import { useDraft } from '@/components/issue-detail/use-draft';
import { PickerPopover, keywordFilter } from '@/components/issue-pickers';
import { FavoriteButton } from '@/components/navigation/favorite-button';
import { Timeline, ZOOMS, type Zoom } from '@/components/roadmap/timeline';
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
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, EmptyState } from '@/components/ui-icons';
import { formatDueDate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { InitiativeStatusIcon, InitiativeStatusPicker } from './initiative-glyphs';
import {
  INITIATIVE_NAME_MAX,
  INITIATIVE_STATUS_LABEL,
  initiativesPath,
  type InitiativeDetail as Detail,
  type InitiativeRow,
} from './initiative-model';

function PropertyButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 max-w-full gap-2 font-normal', className)}
      {...props}
    />
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function InitiativeDetail({
  workspace,
  detail,
  viewerId,
  canDelete,
}: {
  workspace: { id: string; slug: string; name: string };
  detail: Detail;
  viewerId: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [initiative, patchOptimistic] = useOptimistic(
    detail.initiative,
    (current, patch: Partial<InitiativeRow>) => ({ ...current, ...patch }),
  );
  const [epics, removeOptimistic] = useOptimistic(detail.epics, (list, id: string) =>
    list.filter((epic) => epic.id !== id),
  );
  const [, startTransition] = useTransition();
  const [zoom, setZoom] = useState<Zoom>('months');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { members } = detail;

  const save = (patch: InitiativeInput, optimistic: Partial<InitiativeRow>) =>
    startTransition(async () => {
      patchOptimistic(optimistic);
      const result = await updateInitiative({ workspaceId: workspace.id, id: initiative.id, patch });
      if (!result.ok) toast.error(result.error);
    });

  const link = (epicId: string, projectId: string) =>
    startTransition(async () => {
      const result = await setEpicInitiative({ projectId, epicId, initiativeId: initiative.id });
      if (!result.ok) toast.error(result.error);
    });

  const unlink = (epicId: string, projectId: string) =>
    startTransition(async () => {
      removeOptimistic(epicId);
      const result = await setEpicInitiative({ projectId, epicId, initiativeId: null });
      if (!result.ok) toast.error(result.error);
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteInitiative({ workspaceId: workspace.id, id: initiative.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Initiative deleted');
      router.push(initiativesPath(workspace.slug));
    });

  const owner = initiative.owner;
  const dated = epics.filter((epic) => epic.startDate || epic.targetDate);
  const milestonesByEpic = new Map<string, Detail['milestones']>();
  for (const milestone of detail.milestones) {
    milestonesByEpic.set(milestone.epicId, [...(milestonesByEpic.get(milestone.epicId) ?? []), milestone]);
  }

  const sidebar = (
    <aside aria-label="Initiative properties" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <PropertyRow label="Status">
          <InitiativeStatusPicker value={initiative.status} onChange={(status) => save({ status }, { status })}>
            <PropertyButton>
              <InitiativeStatusIcon status={initiative.status} />
              {INITIATIVE_STATUS_LABEL[initiative.status]}
            </PropertyButton>
          </InitiativeStatusPicker>
        </PropertyRow>
        <PropertyRow label="Owner">
          <MemberPicker
            value={owner?.id ?? null}
            members={members}
            viewerId={viewerId}
            placeholder="Set owner…"
            noneLabel="No owner"
            onChange={(ownerId) =>
              save({ ownerId }, { owner: members.find((m) => m.id === ownerId) ?? null })
            }
          >
            <PropertyButton>
              {owner ? (
                <>
                  <Avatar name={owner.name} src={owner.image} size={20} />
                  <span className="truncate">{owner.name}</span>
                </>
              ) : (
                <>
                  <UserRound className="text-muted-foreground" />
                  <Muted>No owner</Muted>
                </>
              )}
            </PropertyButton>
          </MemberPicker>
        </PropertyRow>
        <PropertyRow label="Target date">
          <DatePicker
            value={initiative.targetDate}
            clearLabel="Clear target date"
            onChange={(targetDate) => save({ targetDate }, { targetDate })}
          >
            <PropertyButton>
              <CalendarDays className="text-muted-foreground" />
              {initiative.targetDate ? formatDueDate(initiative.targetDate) : <Muted>Set target</Muted>}
            </PropertyButton>
          </DatePicker>
        </PropertyRow>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">
          Progress · {epics.length} {epics.length === 1 ? 'epic' : 'epics'}
        </span>
        <ProgressBlock progress={initiative.progress} />
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href={`/dashboard/workspaces/${workspace.slug}`} className="hover:text-foreground">
          {workspace.name}
        </Link>
        <ChevronRight className="size-3" />
        <Link href={initiativesPath(workspace.slug)} className="hover:text-foreground">
          Initiatives
        </Link>
      </div>

      <div className="mb-4 flex items-start gap-2">
        <InitiativeName name={initiative.name} onSave={(name) => save({ name }, { name })} />
        <div className="ml-auto flex shrink-0 items-center gap-1 pt-1">
          <FavoriteButton targetType="initiative" targetId={initiative.id} />
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Initiative actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Delete initiative
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <InitiativeDescription
            description={initiative.description}
            onSave={(description) => save({ description }, { description })}
          />

          <section aria-labelledby="linked-epics" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 id="linked-epics" className="text-sm font-medium">
                Epics
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">{epics.length}</span>
              <AddEpicPicker candidates={detail.candidates} onPick={link}>
                <Button variant="ghost" size="xs" className="ml-auto" disabled={detail.candidates.length === 0}>
                  <Plus />
                  Add epic
                </Button>
              </AddEpicPicker>
            </div>
            {epics.length === 0 ? (
              <EmptyState
                icon={<Plus />}
                title="No epics linked"
                description={
                  detail.candidates.length > 0
                    ? 'Add epics from this workspace’s projects to track them together.'
                    : 'Epics from projects in this workspace (where you can edit) can be added here.'
                }
                className="rounded-md border border-border py-8"
              />
            ) : (
              <div role="list" className="flex flex-col rounded-md border border-border">
                {epics.map((epic) => (
                  <div
                    key={epic.id}
                    role="listitem"
                    className="group flex min-h-10 items-center gap-3 border-b border-border px-3 py-1 text-sm last:border-b-0"
                  >
                    <Link
                      href={epicPath(epic.projectId, epic.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 outline-none hover:underline focus-visible:underline"
                    >
                      <EpicIcon color={epic.color} />
                      <span className="truncate font-medium">{epic.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {epic.projectKey}
                      </span>
                    </Link>
                    <span className="hidden w-20 md:block">
                      <HealthChip health={epic.health} />
                    </span>
                    <span className="hidden w-16 text-xs text-muted-foreground md:block">
                      {epic.targetDate ? formatDueDate(epic.targetDate) : ''}
                    </span>
                    <span className="hidden w-24 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <EpicStatusIcon status={epic.status} />
                      <span className="truncate">{EPIC_STATUS_LABEL[epic.status]}</span>
                    </span>
                    <EpicProgress progress={epic.progress} color={epic.color} className="w-20" />
                    {epic.canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${epic.name} from initiative`}
                        title="Remove from initiative"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => unlink(epic.id, epic.projectId)}
                      >
                        <X />
                      </Button>
                    ) : (
                      <span className="size-6" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {dated.length > 0 && (
            <section aria-labelledby="initiative-timeline" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 id="initiative-timeline" className="text-sm font-medium">
                  Timeline
                </h2>
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  spacing={0}
                  value={zoom}
                  onValueChange={(value) => ZOOMS.some((z) => z.id === value) && setZoom(value as Zoom)}
                  aria-label="Zoom"
                  className="ml-auto"
                >
                  {ZOOMS.map((z) => (
                    <ToggleGroupItem key={z.id} value={z.id} className="px-2 text-xs">
                      {z.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <Timeline
                zoom={zoom}
                items={dated.map((epic) => ({
                  id: epic.id,
                  name: epic.name,
                  color: epic.color,
                  status: epic.status,
                  startDate: epic.startDate,
                  targetDate: epic.targetDate,
                  progress: epic.progress,
                  href: epicPath(epic.projectId, epic.id),
                  meta: epic.projectKey,
                  milestones: milestonesByEpic.get(epic.id) ?? [],
                  editable: false,
                }))}
              />
            </section>
          )}
        </div>
        {sidebar}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{initiative.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its epics stay in their projects and are simply unlinked. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddEpicPicker({
  candidates,
  onPick,
  children,
}: {
  candidates: Detail['candidates'];
  onPick: (epicId: string, projectId: string) => void;
  children: ReactNode;
}) {
  return (
    <PickerPopover
      align="end"
      className="w-72"
      content={(close) => (
        <Command filter={keywordFilter}>
          <CommandInput placeholder="Add epic…" />
          <CommandList>
            <CommandEmpty>No epic found.</CommandEmpty>
            {candidates.map((epic) => (
              <CommandItem
                key={epic.id}
                value={epic.id}
                keywords={[epic.name, epic.projectKey]}
                onSelect={() => {
                  close();
                  onPick(epic.id, epic.projectId);
                }}
              >
                <EpicIcon color={epic.color} />
                <span className="truncate">{epic.name}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {epic.projectKey}
                  {epic.initiativeId && ' · moves'}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      )}
    >
      {children}
    </PickerPopover>
  );
}

function InitiativeName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useDraft(name);
  const commit = () => {
    const next = draft.trim().slice(0, INITIATIVE_NAME_MAX);
    if (!next) setDraft(name);
    else if (next !== name) onSave(next);
  };
  return (
    <Textarea
      aria-label="Initiative name"
      value={draft}
      rows={1}
      maxLength={INITIATIVE_NAME_MAX}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(name);
          e.currentTarget.blur();
        }
      }}
      className="min-h-0 flex-1 resize-none border-transparent bg-transparent px-1 py-0.5 text-xl font-medium shadow-none hover:border-border dark:bg-transparent"
    />
  );
}

function InitiativeDescription({
  description,
  onSave,
}: {
  description: string | null;
  onSave: (description: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? '');
  const commit = () => {
    setEditing(false);
    const next = draft.trim() ? draft : null;
    if (next !== description) onSave(next);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <RichTextEditor
          autoFocus
          aria-label="Description"
          value={draft}
          onChange={setDraft}
          onSubmit={commit}
          onCancel={() => setEditing(false)}
          maxLength={EPIC_DESCRIPTION_MAX}
        />
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={commit}>
            Save
          </Button>
        </div>
      </div>
    );
  }
  return (
    <section aria-label="Description" className="flex flex-col items-start gap-2">
      {description ? (
        <RichText source={description} />
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          setDraft(description ?? '');
          setEditing(true);
        }}
      >
        {description ? 'Edit description' : 'Write description'}
      </Button>
    </section>
  );
}
