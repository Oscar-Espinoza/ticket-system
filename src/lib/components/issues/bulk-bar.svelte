<!--
  Floating action bar for the multi-selection: every edit,
  label toggle, archive and trash is one mutation call (one server call, one
  undo entry).
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import type { LucideIcon } from '@lucide/svelte';
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import BoxIcon from '@lucide/svelte/icons/box';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
  import HashIcon from '@lucide/svelte/icons/hash';
  import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';
  import SignalHighIcon from '@lucide/svelte/icons/signal-high';
  import TagIcon from '@lucide/svelte/icons/tag';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import TriangleIcon from '@lucide/svelte/icons/triangle';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import XIcon from '@lucide/svelte/icons/x';

  import CyclePicker from '@/lib/components/cycles/cycle-picker.svelte';
  import EpicPicker from '@/lib/components/epics/epic-picker.svelte';
  import {
    AssigneePicker,
    DueDateOptions,
    EstimatePicker,
    PickerPopover,
    PriorityPicker,
    StatePicker,
  } from '@/lib/components/issue-pickers';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Separator } from '@/lib/components/ui/separator';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import type { IssuePatch, IssueRow } from '@/lib/issue-model';
  import ConfirmTrashDialog from './confirm-trash-dialog.svelte';
  import { applyPatch, commonValue, copyIds } from './bulk-actions';
  import { hasOpenLayer, isEditableTarget, useIssueSelection, useSelectedIds } from './selection.svelte';
  import type { IssueMutations } from './use-issue-mutations.svelte';
  import LabelToggles from './label-toggles.svelte';

  let { issues, mutations }: { issues: IssueRow[]; mutations: IssueMutations } = $props();

  // Matches no epic: the epic picker shows nothing checked when values differ.
  const MIXED = '__mixed';

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const selection = useIssueSelection();
  const ids = useSelectedIds();
  let trash = $state.raw<IssueRow[]>([]);

  // Listed order (visual order within groups), confirmed issues only.
  const selected = $derived(issues.filter((issue) => ids.current.has(issue.id)));

  const requestTrash = () => {
    if (selected.length === 0) return false;
    trash = selected;
    return true;
  };

  $effect(() => {
    if (!canWrite.current) return;
    const unregister = registerHotkeys([
      {
        key: 'Backspace',
        mod: true,
        scope: m.issues_scope(),
        description: m.issues_bulk_trash_selected(),
        passive: true,
      },
    ]);
    // Capture phase: with a selection, ⌘⌫ means the selection, not the focused
    // issue (the single-issue ⌘⌫ skips events that were already handled).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey || event.defaultPrevented) return;
      if (isEditableTarget(event.target) || hasOpenLayer()) return;
      if (requestTrash()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  });

  const apply = (patch: IssuePatch) => applyPatch(mutations, selected, patch);
  const dueDate = $derived(commonValue(selected, (i) => i.dueDate));
  const epicId = $derived(commonValue(selected, (i) => i.epicId));
</script>

<!-- BarButton: icon + label (label hidden below md), trigger props spread first. -->
{#snippet barButton(
  Icon: LucideIcon,
  label: string,
  props: Record<string, unknown>,
  extra?: { class?: string; onclick?: () => void },
)}
  <Button
    variant="ghost"
    size="sm"
    aria-label={label}
    title={label}
    {...props}
    class={extra?.class ?? (props.class as string | undefined)}
    onclick={extra?.onclick ?? (props.onclick as ((event: MouseEvent) => void) | undefined)}
  >
    <Icon />
    <span class="hidden md:inline">{label}</span>
  </Button>
{/snippet}

{#if selected.length > 0}
  <div data-bulk-bar class="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
    <div
      role="toolbar"
      aria-label={m.issues_bulk_aria({ count: selected.length })}
      class="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-popover"
    >
      <span class="flex shrink-0 items-center gap-1 pl-2 text-xs font-medium tabular-nums" aria-live="polite">
        {m.issues_bulk_selected({ count: selected.length })}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={m.issues_bulk_clear()}
        title={m.issues_bulk_clear_esc()}
        onclick={selection.clear}
      >
        <XIcon />
      </Button>
      <Separator orientation="vertical" class="mx-1 h-5 self-center" />

      {#if !canWrite.current}
        {@render barButton(HashIcon, m.issues_bulk_copy_ids(), {}, { onclick: () => void copyIds(selected) })}
      {/if}

      {#if canWrite.current}
        <StatePicker
          side="top"
          value={commonValue(selected, (i) => i.stateId) ?? null}
          onChange={(stateId) => apply({ stateId })}
        >
          {#snippet children({ props })}
            {@render barButton(CircleDashedIcon, m.common_status(), props)}
          {/snippet}
        </StatePicker>

        <PriorityPicker
          side="top"
          value={commonValue(selected, (i) => i.priority) ?? null}
          onChange={(priority) => apply({ priority })}
        >
          {#snippet children({ props })}
            {@render barButton(SignalHighIcon, m.common_priority(), props)}
          {/snippet}
        </PriorityPicker>

        <AssigneePicker
          side="top"
          value={commonValue(selected, (i) => i.assignee?.id ?? null)}
          onChange={(assigneeId) => apply({ assigneeId })}
        >
          {#snippet children({ props })}
            {@render barButton(UserRoundIcon, m.common_assignee(), props)}
          {/snippet}
        </AssigneePicker>

        {#if data.labels.length > 0}
          <PickerPopover side="top" class="w-60">
            {#snippet children({ props })}
              {@render barButton(TagIcon, m.common_labels(), props)}
            {/snippet}
            {#snippet content()}
              <LabelToggles issues={selected} {mutations} />
            {/snippet}
          </PickerPopover>
        {/if}

        <EstimatePicker
          side="top"
          value={commonValue(selected, (i) => i.estimate)}
          onChange={(estimate) => apply({ estimate })}
        >
          {#snippet children({ props })}
            {@render barButton(TriangleIcon, m.issues_estimate(), props)}
          {/snippet}
        </EstimatePicker>

        <PickerPopover side="top" class="w-auto min-w-64">
          {#snippet children({ props })}
            {@render barButton(CalendarDaysIcon, m.common_due_date(), props)}
          {/snippet}
          {#snippet content(close)}
            <DueDateOptions
              value={dueDate}
              onSelect={(next) => {
                close();
                apply({ dueDate: next });
              }}
            />
            <!-- The options only offer "Remove" for a shared date. -->
            {#if dueDate === undefined}
              <div class="border-t border-border p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start font-normal"
                  onclick={() => {
                    close();
                    apply({ dueDate: null });
                  }}
                >
                  <XIcon class="text-muted-foreground" />
                  {m.issues_bulk_remove_due()}
                </Button>
              </div>
            {/if}
          {/snippet}
        </PickerPopover>

        {#if data.cycles.length > 0}
          <CyclePicker
            side="top"
            value={commonValue(selected, (i) => i.cycleId)}
            onChange={(cycleId) => apply({ cycleId })}
          >
            {#snippet children({ props })}
              {@render barButton(RefreshCcwIcon, m.common_cycle(), props)}
            {/snippet}
          </CyclePicker>
        {/if}

        {#if data.epics.length > 0}
          <EpicPicker
            side="top"
            epics={data.epics}
            value={epicId === undefined ? MIXED : epicId}
            onChange={(next) => apply({ epicId: next })}
          >
            {#snippet children({ props })}
              {@render barButton(BoxIcon, m.issues_epic(), props)}
            {/snippet}
          </EpicPicker>
        {/if}

        <Separator orientation="vertical" class="mx-1 h-5 self-center" />
        {@render barButton(ArchiveIcon, m.issues_archive(), {}, {
          onclick: () => {
            mutations.archiveMany(selected);
            selection.clear();
          },
        })}
        {@render barButton(Trash2Icon, m.issues_move_to_trash(), {}, {
          class: 'hover:bg-destructive/10 hover:text-destructive',
          onclick: () => (trash = selected),
        })}
      {/if}
    </div>
  </div>
{/if}

<ConfirmTrashDialog
  issues={trash}
  onOpenChange={(open) => {
    if (!open) trash = [];
  }}
  onConfirm={() => {
    mutations.removeMany(trash);
    selection.clear();
    trash = [];
  }}
/>
