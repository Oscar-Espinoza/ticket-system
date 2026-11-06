// Focus helpers and the deferrals behind them.
//
// Dialogs, popovers, menus and the palette run their own open/close focus
// handling (bits-ui, the browser restoring focus to the trigger, the palette
// closing before a command runs). Work that must land after that waits through
// `afterFrame` / `afterTask`, so every such workaround is named here instead of
// being a bare timer at the call site.
import type { Attachment } from 'svelte/attachments';

/** Run `fn` on the next animation frame — after a surrounding layer's own focus handling. Returns cancel. */
export function afterFrame(fn: () => void): () => void {
  const id = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(id);
}

/** Run `fn` in a later task — after the current event (e.g. a palette closing) has finished. */
export function afterTask(fn: () => void) {
  setTimeout(fn, 0);
}

// The `autofocus` attribute only focuses when nothing else has focus (it
// relies on the browser), so fields that appear after a click — inline
// editors, dialogs opened from a focused button — never got focus. Primitives
// that take an `autofocus` prop attach this instead.
export const focusOnMount: Attachment<HTMLElement> = (node) =>
  // Lets a surrounding dialog/popover finish its own open-focus handling first.
  afterFrame(() => {
    if (node.isConnected && document.activeElement !== node) node.focus();
  });
