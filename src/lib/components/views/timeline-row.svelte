<!-- One timeline row: sticky name cell + the bar. -->
<script module lang="ts">
  export type DragMode = 'move' | 'start' | 'end';
  export type TimelinePointerEvent = PointerEvent & { currentTarget: EventTarget & HTMLElement };

  export interface TimelineBar {
    left: number;
    width: number;
    label: string;
    stub: boolean;
    editable: boolean;
    dragging: boolean;
  }
</script>

<script lang="ts">
  import {
    handleSelectionClick,
    preventShiftSelect,
    useIsSelected,
    useIssueSelection,
  } from '@/lib/components/issues/selection.svelte';
  import { ISSUE_ROW_ATTR, issueAttr } from '@/lib/components/issues/issue-dom';
  import { isPendingIssue } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { StateIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { NAME_COLUMN } from './timeline-layout';
  import { isClosed } from '@/lib/workflow';

  const ROW_HEIGHT = 32;

  let {
    issue,
    active,
    onSelect,
    bar,
    width,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onBarKeyDown,
  }: {
    issue: IssueRow;
    active: boolean;
    onSelect?: (issue: IssueRow) => void;
    bar: TimelineBar;
    width: number;
    onPointerDown: (event: TimelinePointerEvent, issue: IssueRow, mode: DragMode) => void;
    onPointerMove: (event: TimelinePointerEvent) => void;
    onPointerUp: (event: TimelinePointerEvent, issue: IssueRow) => void;
    onPointerCancel: () => void;
    onBarKeyDown: (event: KeyboardEvent, issue: IssueRow) => void;
  } = $props();

  const selection = useIssueSelection();
  const selected = useIsSelected(() => issue.id);
  const closed = $derived(isClosed(issue.state.type));
  const color = $derived(issue.state.color || 'var(--color-primary)');
  const title = $derived(`${issue.key} ${issue.title}: ${bar.label}`);
</script>

<div role="listitem" class="flex border-b border-border/60" style:height="{ROW_HEIGHT}px">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
  <div
    tabindex="0"
    {...issueAttr(ISSUE_ROW_ATTR, issue.id)}
    aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
    aria-current={active ? 'true' : undefined}
    aria-selected={selection.enabled ? selected.current : undefined}
    onmousedown={preventShiftSelect}
    onclick={(event) => {
      if (!isPendingIssue(issue) && handleSelectionClick(selection, event, issue.id)) return;
      onSelect?.(issue);
    }}
    onkeydown={(event) => {
      if (event.key === 'Enter' && event.target === event.currentTarget) {
        event.preventDefault();
        onSelect?.(issue);
      }
    }}
    class={cn(
      'sticky left-0 z-10 flex shrink-0 cursor-pointer items-center gap-2 border-r border-border bg-background px-3 text-sm outline-none',
      'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      active && 'bg-accent',
      selected.current && 'bg-[color-mix(in_oklch,var(--background),var(--primary)_10%)]',
    )}
    style:width="{NAME_COLUMN}px"
  >
    <StateIcon state={issue.state} size={14} />
    <span class="w-14 shrink-0 truncate font-mono text-xs text-muted-foreground">{issue.key}</span>
    <span class={cn('min-w-0 flex-1 truncate', closed && 'text-muted-foreground')}>{issue.title}</span>
  </div>
  <div class="relative" style:width="{width}px">
    <div
      role="button"
      tabindex="0"
      aria-label={title}
      aria-keyshortcuts={bar.editable ? 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Enter' : 'Enter'}
      title={bar.editable ? `${title}\nDrag to reschedule · ←/→ move a day · Shift+←/→ change due date` : title}
      class={cn(
        'group absolute top-1 z-[2] flex h-6 items-center overflow-hidden rounded-md border text-xs outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        bar.editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        bar.stub && 'border-dashed',
        closed && 'opacity-60',
        bar.dragging && 'shadow-[var(--shadow-popover)]',
      )}
      style:left="{bar.left}px"
      style:width="{bar.width}px"
      style:border-color={color}
      style:background-color={`color-mix(in oklab, ${color} ${bar.stub ? 10 : 22}%, transparent)`}
      style:touch-action="none"
      onpointerdown={(e) => onPointerDown(e, issue, 'move')}
      onpointermove={onPointerMove}
      onpointerup={(e) => onPointerUp(e, issue)}
      onpointercancel={onPointerCancel}
      onkeydown={(e) => onBarKeyDown(e, issue)}
    >
      <span class={cn('relative truncate px-2', closed && 'line-through')}>
        {bar.dragging || bar.width > 90 ? (bar.dragging ? bar.label : issue.title) : ''}
      </span>
      {#if bar.editable}
        <span
          aria-hidden="true"
          class="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
          style:background-color={color}
          onpointerdown={(e) => onPointerDown(e, issue, 'start')}
        ></span>
        <span
          aria-hidden="true"
          class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
          style:background-color={color}
          onpointerdown={(e) => onPointerDown(e, issue, 'end')}
        ></span>
      {/if}
    </div>
  </div>
</div>
