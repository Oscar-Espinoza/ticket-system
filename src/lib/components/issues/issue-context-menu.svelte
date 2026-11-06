<!--
  Right-click menu for list rows, board cards and table rows. One menu wraps
  the whole view (not one per row): the capture handler works out which issue
  was clicked — or the whole selection when that issue is part of it — and
  lets the native browser menu through anywhere else.

  The view wrapper is a `children` snippet that receives the trigger props —
  spread them on the wrapper element:
    <IssueContextMenu {issues} {mutations}>
      {#snippet children({ props })}<div {...props} class={cn(props.class, '…')}>…</div>{/snippet}
    </IssueContextMenu>
-->
<script lang="ts">
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import CheckIcon from '@lucide/svelte/icons/check';
  import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import HashIcon from '@lucide/svelte/icons/hash';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import SignalHighIcon from '@lucide/svelte/icons/signal-high';
  import TagIcon from '@lucide/svelte/icons/tag';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import XIcon from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';

  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
  } from '@/lib/components/ui/context-menu';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { PRIORITY_MENU_ORDER, dueDateQuickOptions, viewerFirst } from '@/lib/components/issue-pickers';
  import { formatDueDate } from '@/lib/dates';
  import { formatHotkey } from '@/lib/svelte/hotkeys.svelte';
  import { issuePath } from '@/lib/issue-links';
  import { PRIORITY_LABEL, type IssuePatch, type IssueRow } from '@/lib/issue-model';
  import { applyPatch, commonValue, copyIds, copyLinks, labelCoverage, toggleLabel } from './bulk-actions';
  import ConfirmTrashDialog from './confirm-trash-dialog.svelte';
  import CoverageMark from './coverage-mark.svelte';
  import { ISSUE_ITEM } from './issue-dom';
  import { useIssueSelection } from './selection.svelte';
  import { isPendingIssue, type IssueMutations } from './use-issue-mutations.svelte';

  let {
    issues,
    mutations,
    children,
  }: {
    /** The issues the view lists (optimistic), so checkmarks follow edits live. */
    issues: IssueRow[];
    mutations: IssueMutations;
    /** The view wrapper (asChild trigger): spread `props` on it. */
    children: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const selection = useIssueSelection();
  let target = $state.raw<{ clicked: string; ids: string[] } | null>(null);
  let trash = $state.raw<IssueRow[]>([]);

  /** The clicked issue (+ the selection when it's part of it), or null off an issue. */
  const targetOf = (event: MouseEvent & { currentTarget: EventTarget & HTMLElement }) => {
    const item = event.target instanceof Element ? event.target.closest<HTMLElement>(ISSUE_ITEM) : null;
    const id = item?.dataset.issueRow ?? item?.dataset.boardCard;
    const issue = id ? issues.find((i) => i.id === id) : undefined;
    if (!item || !issue || isPendingIssue(issue) || !event.currentTarget.contains(item)) return null;
    const selected = selection.get();
    return { clicked: issue.id, ids: selected.has(issue.id) ? [...selected] : [issue.id] };
  };

  const oncontextmenucapture = (event: MouseEvent & { currentTarget: EventTarget & HTMLElement }) => {
    const next = targetOf(event);
    // Not on an issue: keep the browser's own menu (the menu never sees the event).
    if (!next) event.stopPropagation();
    else target = next;
  };

  // Touch long-press opens the menu without a contextmenu event on some browsers.
  const onpointerdowncapture = (event: PointerEvent & { currentTarget: EventTarget & HTMLElement }) => {
    if (event.pointerType !== 'mouse') target = targetOf(event);
  };

  const targets = $derived.by(() => {
    const ids = new Set(target?.ids);
    return issues.filter((i) => ids.has(i.id));
  });
  const clicked = $derived(issues.find((i) => i.id === target?.clicked) ?? null);
  const apply = (patch: IssuePatch) => applyPatch(mutations, targets, patch);

  const members = $derived(viewerFirst(data.members, data.viewer.id));
  const stateId = $derived(commonValue(targets, (i) => i.stateId));
  const priority = $derived(commonValue(targets, (i) => i.priority));
  const assigneeId = $derived(commonValue(targets, (i) => i.assignee?.id ?? null));
  const dueDate = $derived(commonValue(targets, (i) => i.dueDate));
</script>

{#snippet mark(on: boolean)}
  {#if on}<CheckIcon class="ml-auto size-3.5" aria-hidden="true" />{/if}
{/snippet}

<ContextMenu>
  <ContextMenuTrigger class="select-auto" {oncontextmenucapture} {onpointerdowncapture}>
    {#snippet child({ props })}
      {@render children({ props })}
    {/snippet}
  </ContextMenuTrigger>
  {#if targets.length > 0}
    <ContextMenuContent class="w-56">
      <ContextMenuLabel class="truncate text-xs text-muted-foreground">
        {targets.length === 1 ? `${targets[0].key} ${targets[0].title}` : `${targets.length} issues`}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      {#if canWrite.current}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <CircleDashedIcon class="text-muted-foreground" />
            Status
          </ContextMenuSubTrigger>
          <ContextMenuSubContent class="max-h-80 w-52 overflow-y-auto">
            {#each data.states as state (state.id)}
              <ContextMenuItem onSelect={() => apply({ stateId: state.id })}>
                <StateIcon {state} size={14} />
                <span class="truncate">{state.name}</span>
                {@render mark(stateId === state.id)}
              </ContextMenuItem>
            {/each}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <SignalHighIcon class="text-muted-foreground" />
            Priority
          </ContextMenuSubTrigger>
          <ContextMenuSubContent class="w-44">
            {#each PRIORITY_MENU_ORDER as p (p)}
              <ContextMenuItem onSelect={() => apply({ priority: p })}>
                <PriorityIcon priority={p} size={14} />
                {PRIORITY_LABEL[p]}
                {@render mark(priority === p)}
              </ContextMenuItem>
            {/each}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <UserRoundIcon class="text-muted-foreground" />
            Assignee
          </ContextMenuSubTrigger>
          <ContextMenuSubContent class="max-h-80 w-56 overflow-y-auto">
            <ContextMenuItem onSelect={() => apply({ assigneeId: null })}>
              <UserRoundIcon class="text-muted-foreground" />
              No assignee
              {@render mark(assigneeId === null)}
            </ContextMenuItem>
            {#each members as member (member.id)}
              <ContextMenuItem onSelect={() => apply({ assigneeId: member.id })}>
                <Avatar name={member.name} src={member.image} size={20} />
                <span class="truncate">{member.name}</span>
                {#if member.id === data.viewer.id}
                  <span class="text-xs text-muted-foreground">(you)</span>
                {/if}
                {@render mark(assigneeId === member.id)}
              </ContextMenuItem>
            {/each}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {#if data.labels.length > 0}
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <TagIcon class="text-muted-foreground" />
              Labels
            </ContextMenuSubTrigger>
            <ContextMenuSubContent class="max-h-80 w-52 overflow-y-auto">
              {#each data.labels as label (label.id)}
                <ContextMenuItem
                  onSelect={(event: Event) => {
                    // Stay open: toggling several labels is the common case.
                    event.preventDefault();
                    toggleLabel(mutations, targets, label.id);
                  }}
                >
                  <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background-color={label.color}
                  ></span>
                  <span class="truncate">{label.name}</span>
                  <CoverageMark coverage={labelCoverage(targets, label.id)} />
                </ContextMenuItem>
              {/each}
            </ContextMenuSubContent>
          </ContextMenuSub>
        {/if}

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <CalendarDaysIcon class="text-muted-foreground" />
            Due date
          </ContextMenuSubTrigger>
          <ContextMenuSubContent class="w-56">
            {#each dueDateQuickOptions() as option (option.label)}
              <ContextMenuItem onSelect={() => apply({ dueDate: option.value })}>
                <CalendarDaysIcon class="text-muted-foreground" />
                {option.label}
                <span class="ml-auto text-xs text-muted-foreground">{formatDueDate(option.value)}</span>
              </ContextMenuItem>
            {/each}
            {#if dueDate !== null}
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => apply({ dueDate: null })}>
                <XIcon class="text-muted-foreground" />
                Remove due date
              </ContextMenuItem>
            {/if}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
      {/if}

      <ContextMenuItem onSelect={() => void copyIds(targets)}>
        <HashIcon class="text-muted-foreground" />
        {targets.length === 1 ? 'Copy ID' : 'Copy IDs'}
        {#if targets.length === 1}
          <ContextMenuShortcut>{formatHotkey({ mod: true, key: '.' })}</ContextMenuShortcut>
        {/if}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void copyLinks(targets)}>
        <Link2Icon class="text-muted-foreground" />
        {targets.length === 1 ? 'Copy link' : 'Copy links'}
      </ContextMenuItem>
      {#if clicked}
        <ContextMenuItem onSelect={() => window.open(issuePath(clicked.projectId, clicked.key), '_blank', 'noopener')}>
          <ExternalLinkIcon class="text-muted-foreground" />
          Open in new tab
        </ContextMenuItem>
      {/if}

      {#if canWrite.current}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            mutations.archiveMany(targets);
            if (targets.length > 1) selection.clear();
          }}
        >
          <ArchiveIcon class="text-muted-foreground" />
          Archive
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={() => (trash = targets)}>
          <Trash2Icon />
          Move to trash…
        </ContextMenuItem>
      {/if}
    </ContextMenuContent>
  {/if}
</ContextMenu>

<ConfirmTrashDialog
  issues={trash}
  onOpenChange={(open) => {
    if (!open) trash = [];
  }}
  onConfirm={() => {
    mutations.removeMany(trash);
    if (trash.length > 1) selection.clear();
    trash = [];
  }}
/>
