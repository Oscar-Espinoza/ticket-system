// Multi-select for the issues view (list rows, board cards, table rows). The
// selection is a $state.raw Set, so toggling one issue only updates the
// expressions that read it (useIsSelected derives a per-row boolean).
//
// API:
//   setIssueSelectionContext(() => issues)  provider (IssueSelectionProvider): creates the
//       selection, prunes it to the listed (confirmed) issues, registers x / ⌘A / Esc.
//       Call during component init, GETTER arg.
//   <IssueSelectionProvider issues={issues}>  same, as a component
//   useIssueSelection(): IssueSelection       disabled (enabled: false) outside a provider
//   useSelectedIds(): { readonly current: ReadonlySet<string> }
//   useIsSelected(id | () => id): { readonly current: boolean }
//   useHasSelection(): { readonly current: boolean }
//   handleSelectionClick(selection, event, id)  ⌘/Ctrl toggles, Shift extends (true = handled)
//   preventShiftSelect(event)                  onmousedown on rows / checkboxes
//   orderedIssueIds(from), isEditableTarget, hasOpenLayer
//   <SelectCheckbox checked onToggle label tabIndex class>  → select-checkbox.svelte
// `selection.get()` / `selection.selected` are reactive too (read in markup / $derived).

import { createContext, untrack } from 'svelte';

import { hasOpenLayer, isEditableTarget, registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
import type { IssueRow } from '@/lib/issue-model';
import { ISSUE_ITEM, VIEW_SCOPE, issueIdOf } from './issue-dom';
import { isPendingIssue } from './use-issue-mutations.svelte';

export { hasOpenLayer, isEditableTarget };

const EMPTY: ReadonlySet<string> = new Set();

/** Issue ids in visual (DOM) order inside the view containing `from`, de-duplicated. */
export function orderedIssueIds(from: Element): string[] {
  const scope = from.closest(VIEW_SCOPE) ?? from;
  const ids = [...scope.querySelectorAll<HTMLElement>(ISSUE_ITEM)].map(issueIdOf);
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/** The focused row / card inside an issues view, if any. */
function focusedIssueItem(): string | null {
  const el = document.activeElement?.closest<HTMLElement>(ISSUE_ITEM);
  return el?.closest(VIEW_SCOPE) ? issueIdOf(el) : null;
}

export interface IssueSelection {
  /** False outside an IssueSelectionProvider — callers hide selection UI. */
  readonly enabled: boolean;
  /** The selected ids (reactive). */
  readonly selected: ReadonlySet<string>;
  subscribe: (listener: () => void) => () => void;
  /** The selected ids (reactive when read in markup / $derived / $effect). */
  get: () => ReadonlySet<string>;
  /** Replace the selection (ids not currently visible are dropped). */
  set: (ids: Iterable<string>) => void;
  /** Toggle one issue; it becomes the anchor for Shift ranges. */
  toggle: (id: string) => void;
  /** Add the range anchor → `id` (visual order of the view containing `from`). */
  extendTo: (id: string, from: Element) => void;
  clear: () => void;
  /** Keep only these ids (the view's current, confirmed issues). */
  prune: (visible: ReadonlySet<string>) => void;
}

class SelectionStore implements IssueSelection {
  readonly enabled = true;
  #selected = $state.raw<ReadonlySet<string>>(EMPTY);
  #anchor: string | null = null;
  #visible: ReadonlySet<string> | null = null;
  #listeners = new Set<() => void>();

  get selected() {
    return this.#selected;
  }

  #commit(ids: Iterable<string>) {
    const visible = this.#visible;
    const current = this.#selected;
    const next = new Set([...ids].filter((id) => !visible || visible.has(id)));
    if (next.size === current.size && [...next].every((id) => current.has(id))) return;
    this.#selected = next.size > 0 ? next : EMPTY;
    if (this.#anchor && !this.#selected.has(this.#anchor)) this.#anchor = null;
    this.#listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  get = () => this.#selected;

  set = (ids: Iterable<string>) => this.#commit(ids);

  toggle = (id: string) => {
    const next = new Set(this.#selected);
    if (!next.delete(id)) next.add(id);
    this.#anchor = id;
    this.#commit(next);
  };

  extendTo = (id: string, from: Element) => {
    const ids = orderedIssueIds(from);
    const start = this.#anchor ? ids.indexOf(this.#anchor) : -1;
    const end = ids.indexOf(id);
    if (start === -1 || end === -1) return this.toggle(id);
    const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1);
    // The anchor stays put, so repeated Shift+clicks pivot around it.
    this.#commit([...this.#selected, ...range]);
  };

  clear = () => {
    this.#anchor = null;
    this.#commit([]);
  };

  prune = (ids: ReadonlySet<string>) => {
    this.#visible = ids;
    this.#commit(this.#selected);
  };
}

const noop = () => {};
const DISABLED: IssueSelection = {
  enabled: false,
  selected: EMPTY,
  subscribe: () => noop,
  get: () => EMPTY,
  set: noop,
  toggle: noop,
  extendTo: noop,
  clear: noop,
  prune: noop,
};

const [getContext, setContext, hasContext] = createContext<IssueSelection>();

export const useIssueSelection = (): IssueSelection => (hasContext() ? getContext() : DISABLED);

export function useSelectedIds(): { readonly current: ReadonlySet<string> } {
  const selection = useIssueSelection();
  return {
    get current() {
      return selection.get();
    },
  };
}

export function useIsSelected(id: string | (() => string)): { readonly current: boolean } {
  const selection = useIssueSelection();
  const getId = typeof id === 'function' ? id : () => id;
  // Derived: rows only update when their own flag flips.
  const selected = $derived(selection.get().has(getId()));
  return {
    get current() {
      return selected;
    },
  };
}

export function useHasSelection(): { readonly current: boolean } {
  const selection = useIssueSelection();
  const any = $derived(selection.get().size > 0);
  return {
    get current() {
      return any;
    },
  };
}

/**
 * Row / card click: ⌘/Ctrl toggles, Shift extends the range. Returns true when
 * the click was a selection gesture (the caller then skips opening the issue).
 */
export function handleSelectionClick(
  selection: IssueSelection,
  event: MouseEvent & { currentTarget: EventTarget & HTMLElement },
  id: string,
): boolean {
  if (!selection.enabled) return false;
  if (event.metaKey || event.ctrlKey) selection.toggle(id);
  else if (event.shiftKey) selection.extendTo(id, event.currentTarget);
  else return false;
  return true;
}

/** Shift+click would otherwise select the text between the anchor and the click. */
export const preventShiftSelect = (event: MouseEvent) => {
  if (event.shiftKey) event.preventDefault();
};

/**
 * IssueSelectionProvider: call during component init with a getter for the
 * issues the view currently lists; anything else drops out of the selection.
 */
export function setIssueSelectionContext(issues: () => IssueRow[]): IssueSelection {
  const selection = new SelectionStore();

  $effect(() => {
    const visible = new Set(issues().filter((i) => !isPendingIssue(i)).map((i) => i.id));
    // Re-run on `issues` only, not on the selection prune reads and writes.
    untrack(() => selection.prune(visible));
  });

  $effect(() => {
    const unregister = registerHotkeys([
      {
        key: 'x',
        scope: 'Issues',
        description: 'Select / deselect focused issue',
        when: () => focusedIssueItem() !== null,
        handler: () => {
          const id = focusedIssueItem();
          if (id) selection.toggle(id);
        },
      },
      {
        key: 'a',
        mod: true,
        scope: 'Issues',
        description: 'Select all issues',
        when: () => !hasOpenLayer() && !!document.activeElement?.closest(VIEW_SCOPE),
        handler: () => {
          const scope = document.activeElement?.closest(VIEW_SCOPE);
          if (scope) selection.set(orderedIssueIds(scope));
        },
      },
      { key: 'Esc', scope: 'Issues', description: 'Clear selection', passive: true },
    ]);

    // Capture phase: with a selection, Esc clears it before anything else (e.g.
    // the detail pane's close) sees the key — the registry skips prevented events.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (selection.get().size === 0 || isEditableTarget(event.target) || hasOpenLayer()) return;
      // A keyboard drag on the board / list uses Esc to cancel.
      if (document.querySelector('[data-dragging]')) return;
      event.preventDefault();
      selection.clear();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  });

  return setContext(selection);
}
