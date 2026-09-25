// Session undo stack for issue mutations (client only). useIssueMutations pushes
// an inverse operation after each successful change; toasts and ⌘Z pop them.

import { toast } from 'sonner';

import { registerHotkeys } from '@/lib/hotkeys';

export interface UndoEntry {
  id: string;
  /** Lower-case phrase, e.g. "status change on APP-12". */
  label: string;
  run: () => void;
}

const LIMIT = 20;
let stack: UndoEntry[] = [];

/** Record an inverse operation; returns its id for a toast's Undo button. */
export function pushUndo(label: string, run: () => void): string {
  const id = crypto.randomUUID();
  stack = [...stack.slice(-(LIMIT - 1)), { id, label, run }];
  return id;
}

/** Undo one specific entry (a toast's button). False when it was already undone. */
export function runUndo(id: string): boolean {
  const entry = stack.find((e) => e.id === id);
  if (!entry) return false;
  stack = stack.filter((e) => e !== entry);
  entry.run();
  return true;
}

/** Undo the most recent entry. */
export function undoLast(): UndoEntry | null {
  const entry = stack.at(-1);
  if (!entry) return null;
  stack = stack.slice(0, -1);
  entry.run();
  return entry;
}

/** Sonner `action` for a success toast. */
export function undoToastAction(id: string) {
  return { label: 'Undo', onClick: () => void runUndo(id) };
}

const openDialog = () =>
  document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');

let holders = 0;
let release: (() => void) | null = null;

/**
 * ⌘Z, registered once however many mutation hooks are mounted (the registry
 * fires every matching handler, so one registration per hook would undo N times).
 */
export function retainUndoHotkey(): () => void {
  holders += 1;
  if (holders === 1) {
    release = registerHotkeys([
      {
        mod: true,
        key: 'z',
        description: 'Undo last issue change',
        // ⌘⇧Z is redo elsewhere; an open dialog owns its own keys.
        when: (event) => !event.shiftKey && !openDialog(),
        handler: () => {
          const entry = undoLast();
          if (entry) toast.success(`Undid ${entry.label}`);
          else toast('Nothing to undo');
        },
      },
    ]);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) {
      release?.();
      release = null;
    }
  };
}
