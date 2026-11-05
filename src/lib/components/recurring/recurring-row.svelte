<!-- One schedule in Settings → Recurring issues (local helper of recurring-settings.tsx). -->
<script lang="ts">
  import CirclePause from '@lucide/svelte/icons/circle-pause';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Play from '@lucide/svelte/icons/play';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { formatEstimate } from '@/lib/estimates';
  import { cn } from '@/lib/utils';
  import { describeSchedule, formatRunDay, type RecurringIssue } from '@/components/recurring/schedule';
  import { defaultsToPatch } from './recurring-defaults';

  let {
    item,
    canEdit,
    onEdit,
    onRun,
    onToggle,
    onDelete,
  }: {
    item: RecurringIssue;
    canEdit: boolean;
    onEdit: () => void;
    onRun: () => void;
    onToggle: () => void;
    onDelete: () => void;
  } = $props();

  const data = useProjectData();
  const defaults = $derived(defaultsToPatch(item.data, data));
  const state = $derived(data.states.find((s) => s.id === defaults.stateId));
  const assignee = $derived(data.members.find((m) => m.id === defaults.assigneeId));
  const labels = $derived(data.labels.filter((l) => defaults.labelIds?.includes(l.id)));
</script>

<li class={cn('flex min-h-12 items-center gap-3 px-3 py-2 text-sm', !item.enabled && 'opacity-70')}>
  <Repeat class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  <div class="flex min-w-0 flex-1 flex-col">
    {#if canEdit}
      <button
        type="button"
        onclick={onEdit}
        class="truncate text-left font-medium outline-none hover:underline focus-visible:underline"
      >
        {item.title}
      </button>
    {:else}
      <span class="truncate font-medium">{item.title}</span>
    {/if}
    <span class="truncate text-xs text-muted-foreground">
      {item.broken ? 'Schedule unreadable — edit it to fix' : describeSchedule(item.schedule)}{item.data
        .dueInDays != null
        ? ` · due in ${item.data.dueInDays} ${item.data.dueInDays === 1 ? 'day' : 'days'}`
        : ''}
    </span>
  </div>

  <div class="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
    {#if state}<StateIcon {state} size={14} />{/if}
    {#if defaults.priority && defaults.priority !== 'none'}
      <PriorityIcon priority={defaults.priority} size={14} />
    {/if}
    {#if labels.length > 0}
      <span class="flex items-center gap-0.5" title={labels.map((l) => l.name).join(', ')}>
        {#each labels.slice(0, 4) as l (l.id)}
          <span aria-hidden="true" class="size-2 rounded-full" style:background-color={l.color}></span>
        {/each}
      </span>
    {/if}
    {#if defaults.estimate != null}
      <span>{formatEstimate(data.project.estimateScale, defaults.estimate)}</span>
    {/if}
    {#if assignee}<Avatar name={assignee.name} src={assignee.image} size={20} />{/if}
  </div>

  <span class="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
    {item.enabled ? `Next ${formatRunDay(item.nextRunAt)}` : 'Paused'}
  </span>

  {#if canEdit}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props: triggerProps })}
          <Button {...triggerProps} variant="ghost" size="icon-sm" aria-label="Actions for {item.title}">
            <Ellipsis />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRun}>
          <Play />
          Create issue now
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle}>
          {#if item.enabled}<CirclePause />{:else}<CirclePlay />{/if}
          {item.enabled ? 'Pause' : 'Resume'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {/if}
</li>
