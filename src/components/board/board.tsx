'use client';

import { useEffect, useState } from 'react';
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
} from '@dnd-kit/react';
import { ChevronRight, Plus } from 'lucide-react';

import { useDisplayOptions } from '@/components/issues/display-options';
import { GroupIcon } from '@/components/issues/issue-list';
import type { IssueViewProps } from '@/components/issues/views';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { useSortableGroups, type SortableContainer } from '@/components/views/use-sortable-groups';
import { registerHotkeys } from '@/lib/hotkeys';
import { groupIssues, patchForNestedMove, type IssueGroup } from '@/lib/issue-grouping';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { BoardCard, BoardCardContent } from './board-card';

const COLUMN_WIDTH = 272;
const COLUMN_GAP = 12;

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

interface Cell {
  /** Container id: the column id, or `lane::column` with swimlanes. */
  id: string;
  column: IssueGroup;
  lane: IssueGroup | null;
}

type Items = ReturnType<typeof useSortableGroups>['itemsOf'];

function BoardCell({
  cell,
  items,
  selectedId,
  onSelect,
}: {
  cell: Cell;
  items: Items;
  selectedId: string | null;
  onSelect: IssueViewProps['onSelect'];
}) {
  const { ref, isDropTarget } = useDroppable({
    id: cell.id,
    type: 'column',
    accept: 'issue',
    // CollisionPriority.Low: the cards inside win, the cell catches the rest.
    collisionPriority: 1,
  });

  return (
    <div
      ref={ref}
      data-board-column={cell.id}
      className={cn(
        'flex min-h-24 shrink-0 flex-col gap-1.5 rounded-lg p-1.5 transition-colors',
        'bg-muted/40',
        isDropTarget && 'bg-accent ring-1 ring-ring/40',
      )}
      style={{ width: COLUMN_WIDTH }}
    >
      {items(cell.id).map(({ id, issue }, index) => (
        <BoardCard
          key={id}
          id={id}
          index={index}
          container={cell.id}
          issue={issue}
          active={issue.id === selectedId}
          onSelect={onSelect ? () => onSelect(issue) : undefined}
        />
      ))}
    </div>
  );
}

function ColumnHeader({
  group,
  onCreate,
}: {
  group: IssueGroup;
  onCreate: IssueViewProps['onCreate'];
}) {
  const canWrite = useProjectPermission('write');
  return (
    <header
      className="flex h-8 shrink-0 items-center gap-2 px-1 text-xs font-medium"
      style={{ width: COLUMN_WIDTH }}
    >
      <GroupIcon group={group} />
      <h2 id={`column-${group.id}`} className="truncate text-foreground">
        {group.label}
      </h2>
      <span className="tabular-nums text-muted-foreground">{group.issues.length}</span>
      {canWrite && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={`New ${group.label} issue`}
          onClick={() => onCreate(group.patch)}
        >
          <Plus />
        </Button>
      )}
    </header>
  );
}

export default function Board({
  groups,
  issues,
  mutations,
  selectedId,
  onSelect,
  onCreate,
}: IssueViewProps) {
  const data = useProjectData();
  const [{ subGroupBy, showEmptyGroups, orderBy }] = useDisplayOptions();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  useEffect(
    () =>
      registerHotkeys([
        { key: 'Space', scope: 'Board', description: 'Pick up / drop focused card', passive: true },
        { key: '← → ↑ ↓', scope: 'Board', description: 'Move picked-up card', passive: true },
        { key: 'Esc', scope: 'Board', description: 'Cancel move', passive: true },
      ]),
    [],
  );

  const swimlanes = subGroupBy !== null && groups[0]?.kind !== subGroupBy;
  const lanes: (IssueGroup | null)[] = swimlanes
    ? groupIssues(issues, subGroupBy, data).filter((lane) => showEmptyGroups || lane.issues.length > 0)
    : [null];

  const cells: Cell[] = lanes.flatMap((lane) =>
    groups.map((column) => ({
      id: lane ? `${lane.id}::${column.id}` : column.id,
      column,
      lane,
    })),
  );
  const cellIssues = (cell: Cell): IssueRow[] => {
    if (!cell.lane) return cell.column.issues;
    const inLane = new Set(cell.lane.issues.map((i) => i.id));
    return cell.column.issues.filter((i) => inLane.has(i.id));
  };
  const path = (cell: Cell) => (cell.lane ? [cell.column, cell.lane] : [cell.column]);
  const containers: SortableContainer[] = cells.map((cell) => ({
    id: cell.id,
    issues: cellIssues(cell),
    patchFrom: (issue, fromId) => {
      const from = cells.find((c) => c.id === fromId);
      return patchForNestedMove(issue, path(cell), from ? path(from) : []);
    },
  }));
  const sortable = useSortableGroups({ containers, mutations, manual: orderBy === 'manual' });

  const toggleLane = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <DragDropProvider sensors={sensors} {...sortable.handlers}>
      <div
        data-board
        data-dragging={sortable.dragging || undefined}
        className="-mx-4 flex flex-1 flex-col overflow-auto px-4 pb-4 sm:-mx-6 sm:px-6"
      >
        <div className="sticky top-0 z-10 flex w-max bg-background" style={{ gap: COLUMN_GAP }}>
          {groups.map((group) => (
            <ColumnHeader key={group.id} group={group} onCreate={onCreate} />
          ))}
        </div>
        {lanes.map((lane) => {
          const laneCells = cells.filter((c) => c.lane === lane);
          const isCollapsed = lane !== null && collapsed.has(lane.id);
          return (
            <section
              key={lane?.id ?? 'all'}
              aria-label={lane ? lane.label : undefined}
              className={cn('flex w-max flex-col', lane ? 'pt-2' : 'flex-1')}
            >
              {lane && (
                <button
                  type="button"
                  onClick={() => toggleLane(lane.id)}
                  aria-expanded={!isCollapsed}
                  className="sticky left-0 mb-1.5 flex h-7 w-fit items-center gap-2 rounded px-1 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')} />
                  <GroupIcon group={lane} />
                  <span className="text-foreground">{lane.label}</span>
                  <span className="tabular-nums text-muted-foreground">{lane.issues.length}</span>
                </button>
              )}
              {!isCollapsed && (
                <div className={cn('flex', !lane && 'flex-1 [&>*]:min-h-32')} style={{ gap: COLUMN_GAP }}>
                  {laneCells.map((cell) => (
                    <BoardCell
                      key={cell.id}
                      cell={cell}
                      items={sortable.itemsOf}
                      selectedId={selectedId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {(source) => {
          const issue = sortable.issueOf(String(source.id));
          return issue ? (
            <div style={{ width: COLUMN_WIDTH - 12 }}>
              <BoardCardContent issue={issue} className="shadow-popover" />
            </div>
          ) : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}
