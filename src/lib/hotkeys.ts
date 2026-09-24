// The app's only global keydown listener; the `?` overlay lists exactly what is registered.

export interface Hotkey {
  /** Single key — KeyboardEvent.key, letters matched case-insensitively. */
  key: string;
  /** True for ⌘K / Ctrl+K (matches either meta or ctrl). */
  mod?: boolean;
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

/** useSyncExternalStore subscribe function. */
export function subscribeHotkeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Register a batch of hotkeys. Returns an idempotent cleanup that removes
 * exactly this batch — call it from a useEffect return (auto-unregister on
 * unmount keeps the `?` overlay honest: only registered = only listed).
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

/** Display form: "⌘K" on Mac, "Ctrl+K" elsewhere. */
export function formatHotkey(hotkey: { mod?: boolean; key: string }): string {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.userAgent);
  const mod = hotkey.mod ? (isMac ? '⌘' : 'Ctrl+') : '';
  const key =
    hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
  return `${mod}${key}`;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  );
}

// Radix keeps the open dialog role="dialog" and open menus inside a popper
// wrapper — while any layer is open, bare keys belong to the layer (its own
// Esc/typeahead handling), not to the registry.
function hasOpenLayer(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]',
  );
}

function matches(hotkey: Hotkey, event: KeyboardEvent): boolean {
  const norm = (s: string) => (s.length === 1 ? s.toLowerCase() : s);
  if (norm(hotkey.key) !== norm(event.key)) return false;
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
    if (isEditable(event.target) && !hotkey.allowInInput) continue;
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
