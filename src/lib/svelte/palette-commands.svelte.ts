// Extension point for context-specific palette commands (built-ins are passed as props).
//   registerPaletteCommands(list) → cleanup   call from $effect and return the cleanup
//   paletteCommands.current                   reactive list the command palette renders
//
//   $effect(() => registerPaletteCommands([{ id: 'new-cycle', label: 'New cycle', run }]));

import { createSubscriber } from 'svelte/reactivity';

export interface PaletteCommand {
  /** Unique — re-registering the same id replaces it (idempotent HMR). */
  id: string;
  label: string;
  /** Group heading in the palette (default "General"). */
  section?: string;
  /** Extra cmdk filter terms (not shown in the UI). */
  keywords?: string[];
  run: () => void;
}

// One list for the whole tab.
let commands: PaletteCommand[] = [];
let snapshot: PaletteCommand[] = [];
// Plain Set: subscribers are notified through createSubscriber, not by reactivity.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const listeners = new Set<() => void>();

function publish() {
  snapshot = [...commands];
  listeners.forEach((listener) => listener());
}

/** Register commands; returns an idempotent cleanup. */
export function registerPaletteCommands(next: PaletteCommand[]): () => void {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const ids = new Set(next.map((command) => command.id));
  commands = [...commands.filter((command) => !ids.has(command.id)), ...next];
  publish();
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    commands = commands.filter((command) => !ids.has(command.id));
    publish();
  };
}

const trackCommands = createSubscriber((update) => {
  listeners.add(update);
  return () => {
    listeners.delete(update);
  };
});

/** Reactive view of the extension commands: read `.current` in markup, $derived or $effect. */
export const paletteCommands = {
  get current() {
    trackCommands();
    return snapshot;
  },
};
