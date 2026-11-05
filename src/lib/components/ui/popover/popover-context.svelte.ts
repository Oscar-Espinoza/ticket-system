import { createContext } from 'svelte';

/**
 * Replaces Radix `Popover.Anchor`: bits-ui has no Anchor part, only a
 * `customAnchor` prop on Content. PopoverAnchor registers its element here and
 * PopoverContent uses it as `customAnchor`.
 */
export class PopoverAnchorState {
  element = $state<HTMLElement | null>(null);
}

const [getContext, setContext, hasContext] = createContext<PopoverAnchorState>();

export function setPopoverAnchorContext(state: PopoverAnchorState): PopoverAnchorState {
  return setContext(state);
}

/** The enclosing Popover's anchor state, or null outside a Popover. */
export function getPopoverAnchorContext(): PopoverAnchorState | null {
  return hasContext() ? getContext() : null;
}
