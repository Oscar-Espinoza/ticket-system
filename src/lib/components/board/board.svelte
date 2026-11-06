<!--
  Kanban board: columns per group, optional swimlanes (sub-grouping), drag to
  move / reorder (pointer + keyboard: Space picks up, arrows move one column,
  Space/Enter drops, Esc cancels). —
  the default export, loaded lazily by the issues view registry (IssueViewProps).
-->
<script lang="ts">
  import { DragDropManager } from '@dnd-kit/dom';
  import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor } from '@dnd-kit/svelte';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { useDisplayOptions } from '@/lib/components/issues/display-options.svelte';
  import GroupIcon from '@/lib/components/issues/group-icon.svelte';
  import type { IssueViewProps } from '@/lib/components/issues/views';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { useSortableGroups, type SortableContainer } from '@/lib/components/views/use-sortable-groups.svelte';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { groupIssues, patchForNestedMove, type IssueGroup } from '@/lib/issue-grouping';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import BoardCardContent from './board-card-content.svelte';
  import BoardCell from './board-cell.svelte';
  import { COLUMN_GAP, COLUMN_WIDTH, DRAG_CARD_WIDTH } from './board-layout';
  import ColumnHeader from './column-header.svelte';

  interface Cell {
    /** Container id: the column id, or `lane::column` with swimlanes. */
    id: string;
    column: IssueGroup;
    lane: IssueGroup | null;
  }

  let { groups, issues, mutations, selectedId, onSelect, onCreate }: IssueViewProps = $props();

  // One arrow press moves a picked-up card exactly one column. Enter is left to
  // the card (open detail), so only Space picks up.
  const sensors = [
    PointerSensor,
    KeyboardSensor.configure({
      offset: { x: COLUMN_WIDTH + COLUMN_GAP, y: 48 },
      keyboardCodes: {
        start: ['Space'],
        cancel: ['Escape'],
        end: ['Space', 'Enter'],
        up: ['ArrowUp'],
        down: ['ArrowDown'],
        left: ['ArrowLeft'],
        right: ['ArrowRight'],
      },
    }),
  ];
  // dnd-kit#2112: the provider would create its manager with the default
  // sensors and apply ours only later in an effect, so cards registering first
  // would keep the default KeyboardSensor. Build it here and still pass `sensors`.
  const manager = new DragDropManager({ sensors });
  onDestroy(() => manager.destroy());

  const data = useProjectData();
  const display = useDisplayOptions();
  const collapsed = new SvelteSet<string>();

  $effect(() =>
    registerHotkeys([
      { key: 'Space', scope: 'Board', description: 'Pick up / drop focused card', passive: true },
      { key: '← → ↑ ↓', scope: 'Board', description: 'Move picked-up card', passive: true },
      { key: 'Esc', scope: 'Board', description: 'Cancel move', passive: true },
    ]),
  );

  const subGroupBy = $derived(display.current.subGroupBy);
  const swimlanes = $derived(subGroupBy !== null && groups[0]?.kind !== subGroupBy);
  const lanes: (IssueGroup | null)[] = $derived(
    swimlanes && subGroupBy !== null
      ? groupIssues(issues, subGroupBy, data).filter(
          (lane) => display.current.showEmptyGroups || lane.issues.length > 0,
        )
      : [null],
  );

  const cells: Cell[] = $derived(
    lanes.flatMap((lane) =>
      groups.map((column) => ({
        id: lane ? `${lane.id}::${column.id}` : column.id,
        column,
        lane,
      })),
    ),
  );
  const cellIssues = (cell: Cell): IssueRow[] => {
    if (!cell.lane) return cell.column.issues;
    const inLane = new Set(cell.lane.issues.map((i) => i.id));
    return cell.column.issues.filter((i) => inLane.has(i.id));
  };
  const path = (cell: Cell) => (cell.lane ? [cell.column, cell.lane] : [cell.column]);
  const containers: SortableContainer[] = $derived(
    cells.map((cell) => ({
      id: cell.id,
      issues: cellIssues(cell),
      patchFrom: (issue: IssueRow, fromId: string) => {
        const from = cells.find((c) => c.id === fromId);
        return patchForNestedMove(issue, path(cell), from ? path(from) : []);
      },
    })),
  );
  const sortable = useSortableGroups(() => ({
    containers,
    mutations,
    manual: display.current.orderBy === 'manual',
  }));

  const toggleLane = (id: string) => {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
  };
</script>

<DragDropProvider {manager} {sensors} {...sortable.handlers}>
  <div
    data-board
    data-dragging={sortable.dragging || undefined}
    class="-mx-4 flex flex-1 flex-col overflow-auto px-4 pb-4 sm:-mx-6 sm:px-6"
  >
    <div class="sticky top-0 z-10 flex w-max bg-background" style:gap="{COLUMN_GAP}px">
      {#each groups as group (group.id)}
        <ColumnHeader {group} {onCreate} />
      {/each}
    </div>
    {#each lanes as lane (lane?.id ?? 'all')}
      {@const laneCells = cells.filter((c) => c.lane === lane)}
      {@const isCollapsed = lane !== null && collapsed.has(lane.id)}
      <section aria-label={lane ? lane.label : undefined} class={cn('flex w-max flex-col', lane ? 'pt-2' : 'flex-1')}>
        {#if lane}
          <button
            type="button"
            onclick={() => toggleLane(lane.id)}
            aria-expanded={!isCollapsed}
            class="sticky left-0 mb-1.5 flex h-7 w-fit items-center gap-2 rounded px-1 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRightIcon class={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')} />
            <GroupIcon group={lane} />
            <span class="text-foreground">{lane.label}</span>
            <span class="tabular-nums text-muted-foreground">{lane.issues.length}</span>
          </button>
        {/if}
        {#if !isCollapsed}
          <div class={cn('flex', !lane && 'flex-1 [&>*]:min-h-32')} style:gap="{COLUMN_GAP}px">
            {#each laneCells as cell (cell.id)}
              <BoardCell {cell} items={(id) => sortable.itemsOf(id)} {selectedId} {onSelect} />
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
  <DragOverlay dropAnimation={null}>
    {#snippet children(source)}
      {@const issue = sortable.issueOf(String(source.id))}
      {#if issue}
        <div style:width="{DRAG_CARD_WIDTH}px">
          <BoardCardContent {issue} class="shadow-popover" />
        </div>
      {/if}
    {/snippet}
  </DragOverlay>
</DragDropProvider>
