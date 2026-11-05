// Extension point for context-specific palette commands (built-ins are passed as props).
//
// Svelte face of src/lib/palette-commands.ts. That module is React-free, so the
// registry itself is shared (re-exported, one list for the whole tab); this file
// adds the reactive view the command palette renders.
//   registerPaletteCommands(list) → cleanup   call from $effect and return the cleanup
//   getPaletteCommands() / subscribePaletteCommands(fn)   raw snapshot + listener
//   paletteCommands.current                   reactive list (replaces
//                                             useSyncExternalStore(subscribe…, get…))
//
//   $effect(() => registerPaletteCommands([{ id: 'new-cycle', label: 'New cycle', run }]));

import { createSubscriber } from 'svelte/reactivity';

import { getPaletteCommands, subscribePaletteCommands } from '@/lib/palette-commands';

export { getPaletteCommands, registerPaletteCommands, subscribePaletteCommands } from '@/lib/palette-commands';
export type { PaletteCommand } from '@/lib/palette-commands';

const trackCommands = createSubscriber((update) => subscribePaletteCommands(update));

/** Reactive view of the extension commands: read `.current` in markup, $derived or $effect. */
export const paletteCommands = {
  get current() {
    trackCommands();
    return getPaletteCommands();
  },
};
