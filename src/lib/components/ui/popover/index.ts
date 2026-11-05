/*
 * Port of src/components/ui/popover.tsx (Radix Popover → bits-ui Popover).
 *
 * Caller translation:
 * - `<Popover open={open} onOpenChange={setOpen}>` keeps working; `bind:open={open}` also works.
 *   `defaultOpen` is supported. Radix `modal` has no bits equivalent (no caller uses it).
 * - `<PopoverTrigger asChild><Button …/></PopoverTrigger>` →
 *   `<PopoverTrigger>{#snippet child({ props })}<Button {...props} …/>{/snippet}</PopoverTrigger>`.
 * - PopoverContent: same props and defaults (`align="center"`, `sideOffset={4}`, `side`, `class`).
 *   Always portaled to <body> like React (`portalProps={{ disabled: true }}` renders in place).
 *   Focus is not trapped (Radix non-modal behaviour); pass `trapFocus` to opt in.
 *   Event renames: `onEscapeKeyDown` → `onEscapeKeydown`, `onPointerDownOutside` /
 *   `onInteractOutside` → `onInteractOutside`; `onOpenAutoFocus` / `onCloseAutoFocus` unchanged
 *   (call `e.preventDefault()`). `onClick` → `onclick`. Svelte DOM events do not bubble through
 *   the portal to the component tree, so React's "stop picks reaching the row underneath"
 *   `stopPropagation` is not needed (harmless to keep).
 * - CSS vars in caller classes: `--radix-popover-trigger-width` → `--bits-popover-anchor-width`,
 *   `--radix-popover-content-*` → `--bits-popover-content-*`.
 * - PopoverAnchor: `<PopoverAnchor>…</PopoverAnchor>` renders a div that Content positions against
 *   (bits `customAnchor`); `asChild` → `{#snippet child({ props })}<el {...props} />{/snippet}`.
 *   An explicit `customAnchor` on PopoverContent wins.
 */
import Root from './popover.svelte';
import Anchor from './popover-anchor.svelte';
import Content from './popover-content.svelte';
import Description from './popover-description.svelte';
import Header from './popover-header.svelte';
import Title from './popover-title.svelte';
import Trigger from './popover-trigger.svelte';

export {
  Root as Popover,
  Anchor as PopoverAnchor,
  Content as PopoverContent,
  Description as PopoverDescription,
  Header as PopoverHeader,
  Title as PopoverTitle,
  Trigger as PopoverTrigger,
};
