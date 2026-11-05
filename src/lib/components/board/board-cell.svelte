<!-- One column (or column × swimlane) drop area. (BoardCell in board.tsx) -->
<script lang="ts">
  import { createDroppable } from '@dnd-kit/svelte';

  import type { IssueViewProps } from '@/lib/components/issues/views';
  import type { IssueGroup } from '@/lib/issue-grouping';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import BoardCard from './board-card.svelte';
  import { COLUMN_WIDTH } from './board-layout';

  interface Cell {
    id: string;
    column: IssueGroup;
    lane: IssueGroup | null;
  }

  let {
    cell,
    items,
    selectedId,
    onSelect,
  }: {
    cell: Cell;
    items: (containerId: string) => { id: string; issue: IssueRow }[];
    selectedId: string | null;
    onSelect: IssueViewProps['onSelect'];
  } = $props();

  const droppable = createDroppable({
    get id() {
      return cell.id;
    },
    type: 'column',
    accept: 'issue',
    // CollisionPriority.Low: the cards inside win, the cell catches the rest.
    collisionPriority: 1,
  });
</script>

<div
  {@attach droppable.attach}
  data-board-column={cell.id}
  class={cn(
    'flex min-h-24 shrink-0 flex-col gap-1.5 rounded-lg p-1.5 transition-colors',
    'bg-muted/40',
    droppable.isDropTarget && 'bg-accent ring-1 ring-ring/40',
  )}
  style:width="{COLUMN_WIDTH}px"
>
  {#each items(cell.id) as { id, issue }, index (id)}
    <BoardCard
      {id}
      {index}
      container={cell.id}
      {issue}
      active={issue.id === selectedId}
      onSelect={onSelect ? () => onSelect(issue) : undefined}
    />
  {/each}
</div>
