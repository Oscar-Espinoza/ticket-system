<!--
  A draggable board card. Must render inside
  the board's DragDropProvider.
-->
<script lang="ts">
  import { createSortable } from '@dnd-kit/svelte/sortable';

  import {
    handleSelectionClick,
    preventShiftSelect,
    useIsSelected,
    useIssueSelection,
  } from '@/lib/components/issues/selection.svelte';
  import { boardCardAttr } from '@/lib/components/issues/issue-dom';
  import { isPendingIssue } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import BoardCardContent from './board-card-content.svelte';

  let {
    id,
    index,
    container,
    issue,
    active,
    onSelect,
  }: {
    /** Sortable id (unique per container — an issue can sit in several label columns). */
    id: string;
    index: number;
    /** Column / cell the card is in. */
    container: string;
    issue: IssueRow;
    active: boolean;
    onSelect?: () => void;
  } = $props();

  const canWrite = useProjectPermission('write');
  const selection = useIssueSelection();
  const selected = useIsSelected(() => issue.id);
  const sortable = createSortable({
    get id() {
      return id;
    },
    get index() {
      return index;
    },
    get group() {
      return container;
    },
    type: 'issue',
    accept: 'issue',
    get disabled() {
      return !canWrite.current || isPendingIssue(issue);
    },
  });
</script>

<!-- Focusable, clickable card without a role. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
<div
  {@attach sortable.attach}
  tabindex={0}
  {...boardCardAttr(issue.id)}
  aria-label={`${issue.key} ${issue.title}, ${issue.state.name}.${canWrite.current ? ' Press Space to move.' : ''}`}
  aria-current={active ? 'true' : undefined}
  aria-selected={selection.enabled ? selected.current : undefined}
  onmousedown={preventShiftSelect}
  onclick={(event) => {
    // ⌘/Ctrl+click toggles, Shift+click selects the range (board order: column by column).
    if (!isPendingIssue(issue) && handleSelectionClick(selection, event, issue.id)) return;
    onSelect?.();
  }}
  onkeydown={(event) => {
    if (event.key === 'Enter' && onSelect && event.target === event.currentTarget) {
      event.preventDefault();
      onSelect();
    }
  }}
  class={cn(
    'rounded-md outline-none transition-shadow',
    'hover:ring-1 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring',
    active && 'ring-2 ring-ring',
    selected.current && 'ring-2 ring-primary/70 [&>div]:bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]',
    onSelect && 'cursor-pointer',
    sortable.isDragSource && 'opacity-40',
  )}
>
  <BoardCardContent {issue} />
</div>
