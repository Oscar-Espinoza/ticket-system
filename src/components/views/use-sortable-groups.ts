'use client';

// Drag-to-reorder across issue groups (list groups, board columns / cells).
// While dragging, the live order is local state updated with dnd-kit's move();
// on drop it becomes one mutations.update: the target group's patch (if the
// issue changed group) plus a midpoint sortOrder (manual ordering).

import { useRef, useState, type ComponentProps } from 'react';
import type { DragDropProvider } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { toast } from 'sonner';

import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { sortOrderBetween } from '@/lib/issue-grouping';
import type { IssuePatch, IssueRow } from '@/lib/issue-model';

export interface SortableContainer {
  id: string;
  issues: IssueRow[];
  /** Patch for an issue arriving from container `fromId`; null = can't drop here. */
  patchFrom: (issue: IssueRow, fromId: string) => IssuePatch | null;
}

type Provider = ComponentProps<typeof DragDropProvider>;
type Order = Record<string, string[]>;

// One issue can sit in several containers (label grouping), so sortable ids
// are per container.
export const sortableId = (containerId: string, issueId: string) => `${containerId}:${issueId}`;

export function useSortableGroups({
  containers,
  mutations,
  manual,
}: {
  containers: SortableContainer[];
  mutations: IssueMutations;
  /** Ordering is "manual": within-group moves persist sortOrder. */
  manual: boolean;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  // Handlers need the latest order synchronously (state lags a render).
  const live = useRef<{ order: Order; from: string } | null>(null);

  const byId = new Map<string, IssueRow>();
  const base: Order = {};
  const containerById = new Map<string, SortableContainer>();
  for (const container of containers) {
    containerById.set(container.id, container);
    base[container.id] = container.issues.map((issue) => {
      const id = sortableId(container.id, issue.id);
      byId.set(id, issue);
      return id;
    });
  }

  const containerOf = (current: Order, id: string) =>
    id in current ? id : Object.keys(current).find((key) => current[key].includes(id));

  /** A container's issues in live (dragging) order, each with its sortable id. */
  const itemsOf = (containerId: string): { id: string; issue: IssueRow }[] =>
    (order?.[containerId] ?? base[containerId] ?? []).flatMap((id) => {
      const issue = byId.get(id);
      return issue ? [{ id, issue }] : [];
    });

  const onDragStart: Provider['onDragStart'] = (event) => {
    const source = String(event.operation.source?.id ?? '');
    const from = containerOf(base, source);
    if (!from) return;
    live.current = { order: base, from };
    setOrder(base);
  };

  const onDragOver: Provider['onDragOver'] = (event) => {
    const state = live.current;
    const { source, target } = event.operation;
    if (!state || !source || !target) return;
    const into = containerOf(state.order, String(target.id));
    const current = containerOf(state.order, String(source.id));
    const issue = byId.get(String(source.id));
    if (!into || !current || !issue) return;
    // Without manual ordering a same-group shuffle would just snap back.
    const blocked =
      (into === current && !manual && into === state.from) ||
      (into !== state.from && !containerById.get(into)?.patchFrom(issue, state.from));
    if (blocked) {
      event.preventDefault();
      return;
    }
    const next = move(state.order, event);
    if (next === state.order) return;
    state.order = next;
    setOrder(next);
  };

  const onDragEnd: Provider['onDragEnd'] = (event) => {
    const state = live.current;
    live.current = null;
    setOrder(null);
    if (!state || event.canceled) return;

    const source = String(event.operation.source?.id ?? '');
    const issue = byId.get(source);
    const into = containerOf(state.order, source);
    if (!issue || !into) return;
    const list = state.order[into];
    const index = list.indexOf(source);
    const moved = into !== state.from;
    if (!moved && index === base[state.from].indexOf(source)) {
      const target = event.operation.target;
      if (!manual && target && String(target.id) !== source && containerOf(base, String(target.id)) === into) {
        toast('Switch ordering to Manual to reorder issues.');
      }
      return;
    }

    let patch: IssuePatch = {};
    if (moved) {
      const groupPatch = containerById.get(into)?.patchFrom(issue, state.from);
      if (!groupPatch) return;
      patch = { ...groupPatch };
    }
    if (manual) {
      const neighbour = (i: number) => {
        const other = byId.get(list[i]);
        return other && other.id !== issue.id ? other.sortOrder : undefined;
      };
      patch.sortOrder = sortOrderBetween(neighbour(index - 1), neighbour(index + 1));
    }
    mutations.update(issue, patch);
  };

  return {
    itemsOf,
    /** The issue behind a sortable id (drag overlay). */
    issueOf: (id: string) => byId.get(id) ?? null,
    dragging: order !== null,
    handlers: { onDragStart, onDragOver, onDragEnd },
  };
}
