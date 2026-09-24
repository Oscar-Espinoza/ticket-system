'use client';

import { useEffect } from 'react';
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
} from '@dnd-kit/react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StateIcon } from '@/components/ui-icons';
import { registerHotkeys } from '@/lib/hotkeys';
import type { IssueGroup } from '@/lib/issue-grouping';
import { cn } from '@/lib/utils';
import type { IssueViewProps } from '@/components/issues/views';
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

function BoardColumn({
  group,
  selectedId,
  onSelect,
  onCreate,
}: {
  group: IssueGroup;
  selectedId: string | null;
  onSelect: IssueViewProps['onSelect'];
  onCreate: IssueViewProps['onCreate'];
}) {
  const { ref, isDropTarget } = useDroppable({
    id: group.id,
    type: 'column',
    accept: 'issue',
    disabled: group.patch === null,
  });

  return (
    <section
      aria-labelledby={`column-${group.id}`}
      className="flex shrink-0 flex-col"
      style={{ width: COLUMN_WIDTH }}
    >
      <header className="mb-2 flex h-8 items-center gap-2 px-1 text-xs font-medium">
        {group.state && <StateIcon state={group.state} size={14} />}
        <h2 id={`column-${group.id}`} className="truncate text-foreground">
          {group.label}
        </h2>
        <span className="tabular-nums text-muted-foreground">{group.issues.length}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={`New ${group.label} issue`}
          onClick={() => onCreate(group.patch)}
        >
          <Plus />
        </Button>
      </header>
      <div
        ref={ref}
        data-board-column={group.id}
        className={cn(
          'flex min-h-32 flex-1 flex-col gap-1.5 rounded-lg p-1.5 transition-colors',
          'bg-muted/40',
          isDropTarget && 'bg-accent ring-1 ring-ring/40',
        )}
      >
        {group.issues.map((issue) => (
          <BoardCard
            key={issue.id}
            issue={issue}
            active={issue.id === selectedId}
            onSelect={onSelect ? () => onSelect(issue) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

export default function Board({
  groups,
  mutations,
  selectedId,
  onSelect,
  onCreate,
}: IssueViewProps) {
  useEffect(
    () =>
      registerHotkeys([
        { key: 'Space', scope: 'Board', description: 'Pick up / drop focused card', passive: true },
        { key: '← →', scope: 'Board', description: 'Move picked-up card between columns', passive: true },
        { key: 'Esc', scope: 'Board', description: 'Cancel move', passive: true },
      ]),
    [],
  );

  return (
    <DragDropProvider
      sensors={sensors}
      onDragEnd={(event) => {
        if (event.canceled) return;
        const { source, target } = event.operation;
        const group = groups.find((g) => g.id === target?.id);
        const issue = mutations.issues.find((i) => i.id === source?.id);
        // Columns carry the patch that puts an issue in them (e.g. { stateId }).
        if (issue && group?.patch) mutations.update(issue, group.patch);
      }}
    >
      <div
        data-board
        className="-mx-4 flex flex-1 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6"
        style={{ gap: COLUMN_GAP }}
      >
        {groups.map((group) => (
          <BoardColumn
            key={group.id}
            group={group}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreate={onCreate}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {(source) => {
          const issue = mutations.issues.find((i) => i.id === source.id);
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
