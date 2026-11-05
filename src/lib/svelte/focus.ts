// React's `autoFocus` focuses the element whenever it mounts. Svelte's
// `autofocus` attribute only does so when nothing else has focus (it relies on
// the browser), so fields that appear after a click — inline editors, dialogs
// opened from a focused button — never got focus. Primitives that take an
// `autofocus` prop attach this to get React's behaviour.
import type { Attachment } from 'svelte/attachments';

export const focusOnMount: Attachment<HTMLElement> = (node) => {
  // After the current task: lets a surrounding dialog/popover finish its own
  // open-focus handling first, so this wins like React's commit-phase focus.
  const id = requestAnimationFrame(() => {
    if (node.isConnected && document.activeElement !== node) node.focus();
  });
  return () => cancelAnimationFrame(id);
};
