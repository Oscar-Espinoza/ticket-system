<!--
  Initiative page: editable name / description, property sidebar, linked
  epics (add / remove — each relink is authorized against the epic's project)
  and a read-only mini timeline of those epics.
-->
<script lang="ts">
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import XIcon from '@lucide/svelte/icons/x';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import {
    deleteInitiative,
    setEpicInitiative,
    updateInitiative,
    type InitiativeInput,
  } from '@/lib/actions/initiatives';
  import DatePicker from '@/lib/components/epics/date-picker.svelte';
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import EpicProgress from '@/lib/components/epics/epic-progress.svelte';
  import PropertyButton from '@/lib/components/epics/epic-property-button.svelte';
  import EpicStatusIcon from '@/lib/components/epics/epic-status-icon.svelte';
  import HealthChip from '@/lib/components/epics/health-chip.svelte';
  import MemberPicker from '@/lib/components/epics/member-picker.svelte';
  import { mergePatch, Optimistic } from '@/lib/components/epics/optimistic.svelte';
  import ProgressBlock from '@/lib/components/epics/progress-block.svelte';
  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import FavoriteButton from '@/lib/components/navigation/favorite-button.svelte';
  import Timeline, { ZOOMS, type Zoom } from '@/lib/components/roadmap/timeline.svelte';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { Avatar, EmptyState } from '@/lib/components/ui-icons';
  import { formatDueDate } from '@/lib/dates';
  import { EPIC_STATUS_LABEL, epicPath } from '@/lib/epic-model';
  import {
    INITIATIVE_STATUS_LABEL,
    initiativesPath,
    type InitiativeDetail as Detail,
    type InitiativeEpic,
    type InitiativeRow,
  } from '@/lib/initiative-model';
  import AddEpicPicker from './add-epic-picker.svelte';
  import InitiativeDescription from './initiative-description.svelte';
  import InitiativeName from './initiative-name.svelte';
  import InitiativeStatusIcon from './initiative-status-icon.svelte';
  import InitiativeStatusPicker from './initiative-status-picker.svelte';

  let {
    workspace,
    detail,
    viewerId,
    canDelete,
  }: {
    workspace: { id: string; slug: string; name: string };
    detail: Detail;
    viewerId: string;
    canDelete: boolean;
  } = $props();

  const initiativeState = new Optimistic(
    () => detail.initiative,
    (current: InitiativeRow, patch: Partial<InitiativeRow>) => mergePatch(current, patch),
  );
  const epicsState = new Optimistic(
    () => detail.epics,
    (list: InitiativeEpic[], id: string) => list.filter((epic) => epic.id !== id),
  );
  const initiative = $derived(initiativeState.current);
  const epics = $derived(epicsState.current);
  let zoom = $state<Zoom>('months');
  let confirmDelete = $state(false);
  const members = $derived(detail.members);

  // One useTransition in React: run every write as a transition of both views.
  async function transition(fn: () => Promise<unknown>) {
    await epicsState.transition(() => initiativeState.transition(fn));
  }

  const save = (patch: InitiativeInput, next: Partial<InitiativeRow>) =>
    void transition(async () => {
      initiativeState.apply(next);
      const result = await updateInitiative({ workspaceId: workspace.id, id: initiative.id, patch });
      if (!result.ok) toast.error(result.error);
    });

  const link = (epicId: string, projectId: string) =>
    void transition(async () => {
      const result = await setEpicInitiative({ projectId, epicId, initiativeId: initiative.id });
      if (!result.ok) toast.error(result.error);
    });

  const unlink = (epicId: string, projectId: string) =>
    void transition(async () => {
      epicsState.apply(epicId);
      const result = await setEpicInitiative({ projectId, epicId, initiativeId: null });
      if (!result.ok) toast.error(result.error);
    });

  const remove = () => {
    // Read before the await: the action's refresh re-runs the page load, which now
    // 404s and unmounts this component, so props are gone afterwards (React's
    // closure kept them).
    const slug = workspace.slug;
    const workspaceId = workspace.id;
    const id = initiative.id;
    void transition(async () => {
      const result = await deleteInitiative({ workspaceId, id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Initiative deleted');
      void goto(initiativesPath(slug));
    });
  };

  const owner = $derived(initiative.owner);
  const dated = $derived(epics.filter((epic) => epic.startDate || epic.targetDate));
  const milestonesByEpic = $derived.by(() => {
    const map = new Map<string, Detail['milestones']>();
    for (const milestone of detail.milestones) {
      map.set(milestone.epicId, [...(map.get(milestone.epicId) ?? []), milestone]);
    }
    return map;
  });
  const timelineItems = $derived(
    dated.map((epic) => ({
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
    })),
  );
</script>

{#snippet sidebar()}
  <aside aria-label="Initiative properties" class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <PropertyRow label="Status">
        <InitiativeStatusPicker
          value={initiative.status}
          onChange={(status) => save({ status }, { status })}
        >
          {#snippet children({ props })}
            <PropertyButton {...props}>
              <InitiativeStatusIcon status={initiative.status} />
              {INITIATIVE_STATUS_LABEL[initiative.status]}
            </PropertyButton>
          {/snippet}
        </InitiativeStatusPicker>
      </PropertyRow>
      <PropertyRow label="Owner">
        <MemberPicker
          value={owner?.id ?? null}
          {members}
          {viewerId}
          placeholder="Set owner…"
          noneLabel="No owner"
          onChange={(ownerId) =>
            save({ ownerId }, { owner: members.find((m) => m.id === ownerId) ?? null })}
        >
          {#snippet children({ props })}
            <PropertyButton {...props}>
              {#if owner}
                <Avatar name={owner.name} src={owner.image} size={20} />
                <span class="truncate">{owner.name}</span>
              {:else}
                <UserRoundIcon class="text-muted-foreground" />
                <span class="text-muted-foreground">No owner</span>
              {/if}
            </PropertyButton>
          {/snippet}
        </MemberPicker>
      </PropertyRow>
      <PropertyRow label="Target date">
        <DatePicker
          value={initiative.targetDate}
          clearLabel="Clear target date"
          onChange={(targetDate) => save({ targetDate }, { targetDate })}
        >
          {#snippet children({ props })}
            <PropertyButton {...props}>
              <CalendarDaysIcon class="text-muted-foreground" />
              {#if initiative.targetDate}
                {formatDueDate(initiative.targetDate)}
              {:else}
                <span class="text-muted-foreground">Set target</span>
              {/if}
            </PropertyButton>
          {/snippet}
        </DatePicker>
      </PropertyRow>
    </div>
    <div class="flex flex-col gap-2 border-t border-border pt-4">
      <span class="text-xs text-muted-foreground">
        Progress · {epics.length} {epics.length === 1 ? 'epic' : 'epics'}
      </span>
      <ProgressBlock progress={initiative.progress} />
    </div>
  </aside>
{/snippet}

{#snippet noEpicsIcon()}<PlusIcon />{/snippet}

<div class="flex min-h-full flex-col">
  <div class="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
    <a href={`/dashboard/workspaces/${workspace.slug}`} class="hover:text-foreground">
      {workspace.name}
    </a>
    <ChevronRightIcon class="size-3" />
    <a href={initiativesPath(workspace.slug)} class="hover:text-foreground">Initiatives</a>
  </div>

  <div class="mb-4 flex items-start gap-2">
    <InitiativeName name={initiative.name} onSave={(name) => save({ name }, { name })} />
    <div class="ml-auto flex shrink-0 items-center gap-1 pt-1">
      <FavoriteButton targetType="initiative" targetId={initiative.id} />
      {#if canDelete}
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon-sm" aria-label="Initiative actions">
                <EllipsisIcon />
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => (confirmDelete = true)}>
              <Trash2Icon />
              Delete initiative
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      {/if}
    </div>
  </div>

  <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
    <div class="flex min-w-0 flex-col gap-8">
      <InitiativeDescription
        description={initiative.description}
        onSave={(description) => save({ description }, { description })}
      />

      <section aria-labelledby="linked-epics" class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <h2 id="linked-epics" class="text-sm font-medium">Epics</h2>
          <span class="text-xs text-muted-foreground tabular-nums">{epics.length}</span>
          <AddEpicPicker candidates={detail.candidates} onPick={link}>
            {#snippet children({ props })}
              <Button
                {...props}
                variant="ghost"
                size="xs"
                class="ml-auto"
                disabled={detail.candidates.length === 0}
              >
                <PlusIcon />
                Add epic
              </Button>
            {/snippet}
          </AddEpicPicker>
        </div>
        {#if epics.length === 0}
          <EmptyState
            icon={noEpicsIcon}
            title="No epics linked"
            description={detail.candidates.length > 0
              ? 'Add epics from this workspace’s projects to track them together.'
              : 'Epics from projects in this workspace (where you can edit) can be added here.'}
            class="rounded-md border border-border py-8"
          />
        {:else}
          <div role="list" class="flex flex-col rounded-md border border-border">
            {#each epics as epic (epic.id)}
              <div
                role="listitem"
                class="group flex min-h-10 items-center gap-3 border-b border-border px-3 py-1 text-sm last:border-b-0"
              >
                <a
                  href={epicPath(epic.projectId, epic.id)}
                  class="flex min-w-0 flex-1 items-center gap-2 outline-none hover:underline focus-visible:underline"
                >
                  <EpicIcon color={epic.color} />
                  <span class="truncate font-medium">{epic.name}</span>
                  <span class="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {epic.projectKey}
                  </span>
                </a>
                <span class="hidden w-20 md:block">
                  <HealthChip health={epic.health} />
                </span>
                <span class="hidden w-16 text-xs text-muted-foreground md:block">
                  {epic.targetDate ? formatDueDate(epic.targetDate) : ''}
                </span>
                <span class="hidden w-24 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <EpicStatusIcon status={epic.status} />
                  <span class="truncate">{EPIC_STATUS_LABEL[epic.status]}</span>
                </span>
                <EpicProgress progress={epic.progress} color={epic.color} class="w-20" />
                {#if epic.canEdit}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${epic.name} from initiative`}
                    title="Remove from initiative"
                    class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onclick={() => unlink(epic.id, epic.projectId)}
                  >
                    <XIcon />
                  </Button>
                {:else}
                  <span class="size-6"></span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      {#if dated.length > 0}
        <section aria-labelledby="initiative-timeline" class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <h2 id="initiative-timeline" class="text-sm font-medium">Timeline</h2>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              spacing={0}
              bind:value={
                () => zoom,
                (value: string) => ZOOMS.some((z) => z.id === value) && (zoom = value as Zoom)
              }
              aria-label="Zoom"
              class="ml-auto"
            >
              {#each ZOOMS as z (z.id)}
                <ToggleGroupItem value={z.id} class="px-2 text-xs">{z.label}</ToggleGroupItem>
              {/each}
            </ToggleGroup>
          </div>
          <Timeline {zoom} items={timelineItems} />
        </section>
      {/if}
    </div>
    {@render sidebar()}
  </div>

  <AlertDialog bind:open={confirmDelete}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete “{initiative.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          Its epics stay in their projects and are simply unlinked. This can’t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onclick={remove}>Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
