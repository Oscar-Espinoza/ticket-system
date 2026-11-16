<!--
  Read-only quick look at an issue (Space on a focused list row). Space / Esc
  close, Enter opens the full issue in the detail pane.
-->
<script lang="ts">
  import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import Markdown from '@/lib/components/editor/markdown.svelte';
  import DueDateChip from '@/lib/components/issues/due-date-chip.svelte';
  import LabelChips from '@/lib/components/issues/label-chips.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/lib/components/ui/dialog';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { m } from '@/lib/i18n';
  import { issuePath } from '@/lib/issue-links';
  import { PRIORITY_LABEL, type IssueRow } from '@/lib/issue-model';

  let {
    issue,
    onClose,
    onOpen,
  }: {
    issue: IssueRow | null;
    onClose: () => void;
    onOpen: (issue: IssueRow) => void;
  } = $props();

  let content = $state<HTMLElement | null>(null);

  function onkeydown(event: KeyboardEvent, current: IssueRow) {
    // The hotkey registry is paused while a dialog is open.
    if (event.target instanceof HTMLElement && event.target.closest('a, button')) return;
    if (event.key === ' ') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onOpen(current);
    }
  }
</script>

<Dialog open={issue !== null} onOpenChange={(open) => !open && onClose()}>
  {#if issue}
    {@const current = issue}
    <DialogContent
      bind:ref={content}
      class="gap-4 sm:max-w-xl"
      onOpenAutoFocus={(event) => {
        // Focus the dialog itself, not its first button: the Space that
        // opened it would otherwise "click" that button on keyup.
        event.preventDefault();
        content?.focus();
      }}
      onkeydown={(event) => onkeydown(event, current)}
    >
      <div class="flex items-center gap-2 pr-8 text-xs text-muted-foreground">
        <span class="font-mono">{current.key}</span>
        <span aria-hidden="true">·</span>
        <span>{m.editor_peek()}</span>
        <span class="ml-auto hidden sm:inline">
          {m.editor_peek_hint()}
        </span>
      </div>
      <DialogTitle class="text-lg leading-snug font-medium">{current.title}</DialogTitle>
      <DialogDescription class="sr-only">
        {m.editor_peek_sr({ key: current.key })}
      </DialogDescription>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span class="flex items-center gap-1.5">
          <StateIcon state={current.state} size={14} />
          {current.state.name}
        </span>
        <span class="flex items-center gap-1.5">
          <PriorityIcon priority={current.priority} size={14} />
          {PRIORITY_LABEL[current.priority]}
        </span>
        <span class="flex items-center gap-1.5">
          {#if current.assignee}
            <Avatar name={current.assignee.name} src={current.assignee.image} size={20} />
            {current.assignee.name}
          {:else}
            <UserRoundIcon class="size-4 text-muted-foreground" />
            <span class="text-muted-foreground">{m.editor_unassigned()}</span>
          {/if}
        </span>
        {#if current.dueDate}
          <span class="flex items-center gap-1.5">
            <CalendarDaysIcon class="size-4 text-muted-foreground" />
            <DueDateChip dueDate={current.dueDate} stateType={current.state.type} />
          </span>
        {/if}
        {#if current.labels.length > 0}
          <LabelChips labels={current.labels} max={6} class="flex-wrap" />
        {/if}
      </div>

      <div class="max-h-[50vh] overflow-y-auto border-t border-border pt-3 text-sm">
        {#if current.description?.trim()}
          <Markdown embeds={false} source={current.description} />
        {:else}
          <p class="text-muted-foreground">{m.editor_inbox_no_description()}</p>
        {/if}
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" href={issuePath(current.projectId, current.key)}>
          {m.editor_peek_full_page()}
          <ArrowUpRightIcon />
        </Button>
        <Button size="sm" onclick={() => onOpen(current)}>{m.editor_inbox_open_issue()}</Button>
      </div>
    </DialogContent>
  {/if}
</Dialog>
