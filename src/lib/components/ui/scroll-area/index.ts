/*
 * Port of src/components/ui/scroll-area.tsx (Radix ScrollArea → bits-ui ScrollArea).
 * No repo caller uses it yet.
 *
 * Caller translation:
 * - `<ScrollArea class="h-72">…</ScrollArea>`; `type` (`hover` default | `scroll` | `auto` |
 *   `always`), `scrollHideDelay`, `dir` as in Radix. A vertical ScrollBar is always rendered;
 *   add `<ScrollBar orientation="horizontal" />` inside the children for horizontal scrolling.
 * - `bind:viewportRef` gives the scrolling element (Radix had no wrapper prop for it).
 * - Styling: Scrollbar/Thumb `data-state="visible|hidden"`, `data-orientation`; CSS vars are
 *   `--bits-scroll-area-*` (was `--radix-scroll-area-*`).
 */
import Root from './scroll-area.svelte';
import ScrollBar from './scroll-bar.svelte';

export { Root as ScrollArea, ScrollBar };
