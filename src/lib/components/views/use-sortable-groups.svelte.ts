// Drag-to-reorder across issue groups (list groups, board columns / cells).
// While dragging, the live order is local state updated with dnd-kit's move();
// on drop it becomes one mutations.update: the target group's patch (if the
// issue changed group) plus a midpoint sortOrder (manual ordering).
//
// API (port of src/components/views/use-sortable-groups.ts):
//   const sortable = useSortableGroups(() => ({ containers, mutations, manual }))
//     — call during component init with a GETTER (containers change every render).
//   sortable.itemsOf(containerId)  → { id, issue }[] in live (dragging) order (reactive)
//   sortable.issueOf(sortableId)   → IssueRow | null (drag overlay)
//   sortable.dragging              → boolean (reactive)
//   sortable.handlers              → { onDragStart, onDragOver, onDragEnd } for
//                                    <DragDropProvider {...sortable.handlers}>
//   sortableId(containerId, issueId), type SortableContainer — unchanged.

import type { ComponentProps } from 'svelte';
import type { DragDropProvider } from '@dnd-kit/svelte';
import { move } from '@dnd-kit/helpers';
import { toast } from 'svelte-sonner';

import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
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

export interface SortableGroupsInput {
  containers: SortableContainer[];
  mutations: IssueMutations;
  /** Ordering is "manual": within-group moves persist sortOrder. */
  manual: boolean;
}

// One issue can sit in several containers (label grouping), so sortable ids
// are per container.
export const sortableId = (containerId: string, issueId: string) => `${containerId}:${issueId}`;

interface Model {
  byId: Map<string, IssueRow>;
  base: Order;
  containerById: Map<string, SortableContainer>;
}

function buildModel(containers: SortableContainer[]): Model {
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
  return { byId, base, containerById };
}

const containerOf = (current: Order, id: string) =>
  id in current ? id : Object.keys(current).find((key) => current[key].includes(id));

export class SortableGroups {
  #input: () => SortableGroupsInput;
  #order = $state.raw<Order | null>(null);
  // Handlers need the latest order synchronously (state lags a render).
  #live: { order: Order; from: string } | null = null;
  #model = $derived.by(() => buildModel(this.#input().containers));

  constructor(input: () => SortableGroupsInput) {
    this.#input = input;
  }

  /** A container's issues in live (dragging) order, each with its sortable id. */
  itemsOf = (containerId: string): { id: string; issue: IssueRow }[] => {
    const { byId, base } = this.#model;
    return (this.#order?.[containerId] ?? base[containerId] ?? []).flatMap((id) => {
      const issue = byId.get(id);
      return issue ? [{ id, issue }] : [];
    });
  };

  /** The issue behind a sortable id (drag overlay). */
  issueOf = (id: string): IssueRow | null => this.#model.byId.get(id) ?? null;

  get dragging(): boolean {
    return this.#order !== null;
  }

  #onDragStart: NonNullable<Provider['onDragStart']> = (event) => {
    const { base } = this.#model;
    const source = String(event.operation.source?.id ?? '');
    const from = containerOf(base, source);
    if (!from) return;
    this.#live = { order: base, from };
    this.#order = base;
  };

  #onDragOver: NonNullable<Provider['onDragOver']> = (event) => {
    const state = this.#live;
    const { source, target } = event.operation;
    if (!state || !source || !target) return;
    const { byId, containerById } = this.#model;
    const { manual } = this.#input();
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
    this.#order = next;
  };

  #onDragEnd: NonNullable<Provider['onDragEnd']> = (event) => {
    const state = this.#live;
    this.#live = null;
    this.#order = null;
    if (!state || event.canceled) return;

    const { byId, base, containerById } = this.#model;
    const { manual, mutations } = this.#input();
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

  /** Spread onto <DragDropProvider>. */
  readonly handlers = {
    onDragStart: this.#onDragStart,
    onDragOver: this.#onDragOver,
    onDragEnd: this.#onDragEnd,
  };
}

/** Call during component init; `input` is a getter so containers stay live. */
export function useSortableGroups(input: () => SortableGroupsInput): SortableGroups {
  return new SortableGroups(input);
}
