// The app's only global keydown listener; the `?` overlay lists exactly what is registered.
//
// API:
//   registerHotkeys(list) → cleanup      call from $effect / onMount and return the cleanup
//   formatHotkey({ mod, shift, key })    "⌘⇧K" on Mac, "Ctrl+Shift+K" elsewhere
//   getHotkeys() / subscribeHotkeys(fn)  raw snapshot + listener (useSyncExternalStore pair)
//   registeredHotkeys.current            reactive list for the `?` overlay (replaces
//                                        useSyncExternalStore(subscribeHotkeys, getHotkeys))
//   hasOpenLayer() / isEditableTarget()  the layer / text-field tests the registry uses
//
// This is its own registry (not a re-export) because the
// open-layer test must look for bits-ui's floating wrapper instead of Radix's.
// Every Svelte module must register here — never import '@/lib/hotkeys'.
//
//   $effect(() => registerHotkeys([{ key: 'f', description: 'Filter issues', handler: open }]));

import { createSubscriber } from 'svelte/reactivity';

export interface Hotkey {
  /** Single key — KeyboardEvent.key, letters matched case-insensitively. */
  key: string;
  /** True for ⌘K / Ctrl+K (matches either meta or ctrl). */
  mod?: boolean;
  /**
   * Requires Shift (⇧D, ⌘⇧,). Hotkeys without it ignore Shift, so `?` (typed
   * with Shift) and letters keep matching — guard with `when` if Shift must be up.
   */
  shift?: boolean;
  /** Human text for the `?` overlay and registry consumers. */
  description: string;
  /** Overlay grouping label (default "Global"). */
  scope?: string;
  /** Fire even while a text field has focus (⌘K). */
  allowInInput?: boolean;
  /** Extra guard — when it returns false the key passes through untouched. */
  when?: (event: KeyboardEvent) => boolean;
  /** Listed in the `?` overlay only; another component handles the key. */
  passive?: boolean;
  handler?: (event: KeyboardEvent) => void;
}

interface RegisteredHotkey extends Hotkey {
  id: number;
}

let entries: RegisteredHotkey[] = [];
let nextId = 1;
let listening = false;
let snapshot: Hotkey[] = [];
const listeners = new Set<() => void>();

function publish() {
  // RegisteredHotkey extends Hotkey — expose the entries directly (the extra
  // id is invisible to the Hotkey type).
  snapshot = entries;
  listeners.forEach((listener) => listener());
}

/** Immutable snapshot of the currently-registered shortcuts (for the overlay). */
export function getHotkeys(): Hotkey[] {
  return snapshot;
}

/** Listener for registry changes; returns the unsubscribe. */
export function subscribeHotkeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const trackHotkeys = createSubscriber((update) => subscribeHotkeys(update));

/** Reactive view of the registry: read `.current` in markup, $derived or $effect. */
export const registeredHotkeys = {
  get current(): Hotkey[] {
    trackHotkeys();
    return snapshot;
  },
};

/**
 * Register a batch of hotkeys. Returns an idempotent cleanup that removes
 * exactly this batch — return it from an $effect (auto-unregister on destroy
 * keeps the `?` overlay honest: only registered = only listed).
 */
export function registerHotkeys(hotkeys: Hotkey[]): () => void {
  const added = hotkeys.map((hotkey) => ({ ...hotkey, id: nextId++ }));
  entries = [...entries, ...added];
  ensureListener();
  publish();
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    entries = entries.filter((entry) => !added.some((a) => a.id === entry.id));
    publish();
  };
}

/** Display form: "⌘⇧K" on Mac, "Ctrl+Shift+K" elsewhere. */
export function formatHotkey(hotkey: { mod?: boolean; shift?: boolean; key: string }): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const mod = hotkey.mod ? (isMac ? '⌘' : 'Ctrl+') : '';
  const shift = hotkey.shift ? (isMac ? '⇧' : 'Shift+') : '';
  const key =
    hotkey.key === ' ' || hotkey.key === 'Space'
      ? 'Space'
      : hotkey.key.length === 1
        ? hotkey.key.toUpperCase()
        : hotkey.key;
  return `${mod}${shift}${key}`;
}

/** Inside an input / textarea / select / contenteditable. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}

/** The selector behind hasOpenLayer(): open dialogs plus any open floating layer. */
export const OPEN_LAYER_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-bits-floating-content-wrapper]';

// bits-ui keeps the open dialog role="dialog" data-state="open" and renders open
// menus / popovers / selects / tooltips inside a floating wrapper (Radix's
// popper wrapper in the React app) — while any layer is open, bare keys belong
// to the layer (its own Esc/typeahead handling), not to the registry.
export function hasOpenLayer(): boolean {
  return !!document.querySelector(OPEN_LAYER_SELECTOR);
}

const CODE_KEYS: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/** The unshifted character of the physical key (KeyD → d, Comma → ,). */
function codeKey(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return CODE_KEYS[code];
}

function matches(hotkey: Hotkey, event: KeyboardEvent): boolean {
  const norm = (s: string) => (s.length === 1 ? s.toLowerCase() : s);
  const key = norm(hotkey.key);
  if (hotkey.shift) {
    if (!event.shiftKey) return false;
    // Shift changes event.key for punctuation (⇧, types "<" on US layouts), so
    // fall back to the physical key.
    if (key !== norm(event.key) && key !== codeKey(event.code)) return false;
  } else if (key !== norm(event.key)) {
    return false;
  }
  const mod = event.metaKey || event.ctrlKey;
  if (!!hotkey.mod !== mod) return false;
  if (event.altKey) return false;
  return true;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  for (const hotkey of entries) {
    if (hotkey.passive || !hotkey.handler) continue;
    if (!matches(hotkey, event)) continue;
    if (isEditableTarget(event.target) && !hotkey.allowInInput) continue;
    if (!hotkey.mod && !hotkey.allowInInput && hasOpenLayer()) continue;
    if (hotkey.when && !hotkey.when(event)) continue;
    event.preventDefault();
    hotkey.handler(event);
  }
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('keydown', onKeyDown);
  listening = true;
}
