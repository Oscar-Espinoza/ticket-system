<!-- One row of the epics list, with its context menu (epics-list.tsx EpicListRow). -->
<script lang="ts">
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import TagIcon from '@lucide/svelte/icons/tag';
  import { toast } from 'svelte-sonner';

  import { archiveEpic, unarchiveEpic } from '@/lib/actions/epics';
  import {
    ContextMenu,
    ContextMenuCheckboxItem,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
  } from '@/lib/components/ui/context-menu';
  import { Avatar } from '@/lib/components/ui-icons';
  import { formatDueDate } from '@/lib/dates';
  import { cn } from '@/lib/utils';
  import {
    EPIC_STATUS_LABEL,
    epicPath,
    type EpicLabelRow,
    type EpicRow,
  } from '@/lib/components/epics/epic-model';
  import EpicIcon from './epic-icon.svelte';
  import EpicLabelChips from './epic-label-chips.svelte';
  import EpicProgress from './epic-progress.svelte';
  import EpicStatusIcon from './epic-status-icon.svelte';
  import HealthChip from './health-chip.svelte';

  let {
    epic,
    labels,
    projectId,
    canWrite,
    onSetLabels,
  }: {
    epic: EpicRow;
    labels: EpicLabelRow[];
    projectId: string;
    canWrite: boolean;
    onSetLabels: (labelIds: string[]) => void;
  } = $props();

  const own = $derived(epic.labelIds ?? []);
  const href = $derived(epicPath(projectId, epic.id));

  const toggleArchive = async () => {
    const archived = epic.archivedAt;
    const action = archived ? unarchiveEpic : archiveEpic;
    const result = await action({ projectId, id: epic.id });
    if (!result.ok) toast.error(result.error);
    else toast.success(archived ? 'Epic restored' : 'Epic archived');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      toast.success('Copied epic link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  };
</script>

<ContextMenu>
  <ContextMenuTrigger>
    {#snippet child({ props })}
      <a
        {...props}
        {href}
        role="listitem"
        data-epic-row={epic.id}
        class={cn(
          props.class as string | undefined,
          'flex min-h-10 items-center gap-3 border-b border-border px-3 py-1.5 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent',
        )}
      >
        <span class="flex min-w-0 flex-1 items-center gap-2">
          <EpicIcon color={epic.color} />
          <span class="truncate font-medium">{epic.name}</span>
          {#if epic.archivedAt}
            <span class="shrink-0 text-xs text-muted-foreground">Archived</span>
          {/if}
          <EpicLabelChips
            {labels}
            labelIds={own}
            max={3}
            class="hidden shrink flex-nowrap overflow-hidden sm:flex"
          />
        </span>
        <span class="hidden w-24 md:block">
          <HealthChip health={epic.health} />
        </span>
        <span class="hidden w-6 md:block" title={epic.lead ? `Lead: ${epic.lead.name}` : 'No lead'}>
          {#if epic.lead}
            <Avatar name={epic.lead.name} src={epic.lead.image} size={20} />
          {/if}
        </span>
        <span class="hidden w-20 text-xs text-muted-foreground md:block">
          {epic.targetDate ? formatDueDate(epic.targetDate) : ''}
        </span>
        <span class="flex w-28 items-center gap-1.5 text-xs text-muted-foreground">
          <EpicStatusIcon status={epic.status} />
          <span class="truncate">{EPIC_STATUS_LABEL[epic.status]}</span>
        </span>
        <EpicProgress progress={epic.progress} color={epic.color} class="w-24" />
        <span class="hidden w-16 text-right text-xs text-muted-foreground tabular-nums lg:block">
          {epic.progress.points > 0
            ? `${epic.progress.completedPoints}/${epic.progress.points} pts`
            : ''}
        </span>
        <span class="hidden w-12 text-right text-xs text-muted-foreground tabular-nums sm:block">
          {epic.progress.total}
        </span>
      </a>
    {/snippet}
  </ContextMenuTrigger>
  <ContextMenuContent class="w-48">
    <ContextMenuItem>
      {#snippet child({ props })}
        <a {...props} {href}>Open</a>
      {/snippet}
    </ContextMenuItem>
    <ContextMenuItem onSelect={copyLink}>
      <Link2Icon />
      Copy link
    </ContextMenuItem>
    {#if canWrite && labels.length > 0}
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <TagIcon />
          Labels
        </ContextMenuSubTrigger>
        <ContextMenuSubContent class="max-h-72 w-48 overflow-y-auto">
          <!-- Keep the menu open to toggle several (in bits-ui, preventDefault in onSelect would also cancel the toggle). -->
          {#each labels as label (label.id)}
            <ContextMenuCheckboxItem
              checked={own.includes(label.id)}
              closeOnSelect={false}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                onSetLabels(checked ? [...own, label.id] : own.filter((id) => id !== label.id))}
            >
              <span
                aria-hidden="true"
                class="size-2 shrink-0 rounded-full"
                style="background-color: {label.color}"
              ></span>
              <span class="truncate">{label.name}</span>
            </ContextMenuCheckboxItem>
          {/each}
        </ContextMenuSubContent>
      </ContextMenuSub>
    {/if}
    {#if canWrite}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={toggleArchive}>
        {#if epic.archivedAt}<ArchiveRestoreIcon />{:else}<ArchiveIcon />{/if}
        {epic.archivedAt ? 'Unarchive' : 'Archive'}
      </ContextMenuItem>
    {/if}
  </ContextMenuContent>
</ContextMenu>
