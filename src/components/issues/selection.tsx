'use client';

// Multi-select for the issues view (list rows, board cards, table rows). The
// selection lives in a tiny external store so toggling one issue re-renders
// only the rows whose `selected` flag changed, not the whole list.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Check, Minus } from 'lucide-react';

import { registerHotkeys } from '@/lib/hotkeys';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { isPendingIssue } from './use-issue-mutations';

/** A selectable issue element (list / table row, board card). */
export const ISSUE_ITEM = '[data-issue-row], [data-board-card]';
/** The element wrapping a view's rows — ranges and "select all" stay inside it. */
export const VIEW_SCOPE = '[data-issue-view]';

const EMPTY: ReadonlySet<string> = new Set();

export const isEditableTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

/** An open dialog / menu / popover owns the keyboard (same test as the hotkey registry). */
export const hasOpenLayer = () =>
  !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]',
  );

const itemId = (el: HTMLElement) => el.dataset.issueRow ?? el.dataset.boardCard ?? null;

/** Issue ids in visual (DOM) order inside the view containing `from`, de-duplicated. */
export function orderedIssueIds(from: Element): string[] {
  const scope = from.closest(VIEW_SCOPE) ?? from;
  const ids = [...scope.querySelectorAll<HTMLElement>(ISSUE_ITEM)].map(itemId);
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/** The focused row / card inside an issues view, if any. */
function focusedIssueItem(): string | null {
  const el = document.activeElement?.closest<HTMLElement>(ISSUE_ITEM);
  return el?.closest(VIEW_SCOPE) ? itemId(el) : null;
}

export interface IssueSelection {
  /** False outside an IssueSelectionProvider — callers hide selection UI. */
  enabled: boolean;
  subscribe: (listener: () => void) => () => void;
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

function createSelection(): IssueSelection {
  let selected = EMPTY;
  let anchor: string | null = null;
  let visible: ReadonlySet<string> | null = null;
  const listeners = new Set<() => void>();

  const commit = (ids: Iterable<string>) => {
    const next = new Set([...ids].filter((id) => !visible || visible.has(id)));
    if (next.size === selected.size && [...next].every((id) => selected.has(id))) return;
    selected = next.size > 0 ? next : EMPTY;
    if (anchor && !selected.has(anchor)) anchor = null;
    listeners.forEach((listener) => listener());
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    anchor = id;
    commit(next);
  };

  return {
    enabled: true,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => selected,
    set: (ids) => commit(ids),
    toggle,
    extendTo: (id, from) => {
      const ids = orderedIssueIds(from);
      const start = anchor ? ids.indexOf(anchor) : -1;
      const end = ids.indexOf(id);
      if (start === -1 || end === -1) return toggle(id);
      const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1);
      // The anchor stays put, so repeated Shift+clicks pivot around it.
      commit([...selected, ...range]);
    },
    clear: () => {
      anchor = null;
      commit([]);
    },
    prune: (ids) => {
      visible = ids;
      commit(selected);
    },
  };
}

const noop = () => {};
const DISABLED: IssueSelection = {
  enabled: false,
  subscribe: () => noop,
  get: () => EMPTY,
  set: noop,
  toggle: noop,
  extendTo: noop,
  clear: noop,
  prune: noop,
};

const SelectionContext = createContext<IssueSelection>(DISABLED);

export const useIssueSelection = () => useContext(SelectionContext);

export function useSelectedIds(): ReadonlySet<string> {
  const selection = useIssueSelection();
  return useSyncExternalStore(selection.subscribe, selection.get, () => EMPTY);
}

export function useIsSelected(id: string): boolean {
  const selection = useIssueSelection();
  return useSyncExternalStore(
    selection.subscribe,
    () => selection.get().has(id),
    () => false,
  );
}

export function useHasSelection(): boolean {
  const selection = useIssueSelection();
  return useSyncExternalStore(
    selection.subscribe,
    () => selection.get().size > 0,
    () => false,
  );
}

/**
 * Row / card click: ⌘/Ctrl toggles, Shift extends the range. Returns true when
 * the click was a selection gesture (the caller then skips opening the issue).
 */
export function handleSelectionClick(
  selection: IssueSelection,
  event: MouseEvent<HTMLElement>,
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

export function IssueSelectionProvider({
  issues,
  children,
}: {
  /** The issues the view currently lists; anything else drops out of the selection. */
  issues: IssueRow[];
  children: ReactNode;
}) {
  const [selection] = useState(createSelection);

  useEffect(() => {
    selection.prune(new Set(issues.filter((i) => !isPendingIssue(i)).map((i) => i.id)));
  }, [selection, issues]);

  useEffect(() => {
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
  }, [selection]);

  return <SelectionContext.Provider value={selection}>{children}</SelectionContext.Provider>;
}

/** Small tri-state checkbox (Check / Minus) used by rows and the table header. */
export function SelectCheckbox({
  checked,
  onToggle,
  label,
  tabIndex = -1,
  className,
}: {
  checked: boolean | 'mixed';
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  /** Rows keep their checkbox out of the tab order (the row is the stop). */
  tabIndex?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={tabIndex}
      onMouseDown={preventShiftSelect}
      onClick={(event) => {
        // Don't open the issue underneath.
        event.stopPropagation();
        onToggle(event);
      }}
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background outline-none transition-[opacity,colors]',
        'after:absolute after:-inset-1.5 hover:border-ring focus-visible:ring-2 focus-visible:ring-ring',
        checked && 'border-primary bg-primary text-primary-foreground hover:border-primary',
        className,
      )}
    >
      {checked === 'mixed' ? (
        <Minus className="size-3" aria-hidden="true" />
      ) : checked ? (
        <Check className="size-3" aria-hidden="true" />
      ) : null}
    </button>
  );
}
