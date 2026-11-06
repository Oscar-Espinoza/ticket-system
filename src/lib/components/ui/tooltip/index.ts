/*
 * Radix Tooltip → bits-ui Tooltip.
 *
 * Caller translation:
 * - A <TooltipProvider> ancestor is REQUIRED (bits throws without one). The root layout renders
 *   one; nested `<TooltipProvider delayDuration={300}>` overrides work.
 *   TooltipProvider defaults: delayDuration 0, skipDelayDuration 300.
 * - `<TooltipTrigger asChild><Button …/></TooltipTrigger>` →
 *   `<TooltipTrigger>{#snippet child({ props })}<Button {...props} …/>{/snippet}</TooltipTrigger>`.
 *   Spread `props` on the element you render (it carries the handlers and aria attributes).
 * - TooltipContent: same props (`side` default "top", `sideOffset` default 0, `align`, `class`).
 *   It is always portaled to <body>; pass `portalProps={{ disabled: true }}` to render
 *   in place. `onEscapeKeyDown` → `onEscapeKeydown`, `onPointerDownOutside` → `onInteractOutside`.
 * - Tooltip root: `open` + `onOpenChange` or `bind:open`; `defaultOpen`, `delayDuration`,
 *   `disableHoverableContent` as in Radix.
 * - Styling: Content `data-state` is `delayed-open | instant-open | closed` like Radix;
 *   `--radix-tooltip-*` CSS vars are `--bits-tooltip-*` (`…-trigger-width` → `…-anchor-width`).
 */
import Root from './tooltip.svelte';
import Trigger from './tooltip-trigger.svelte';
import Content from './tooltip-content.svelte';
import Provider from './tooltip-provider.svelte';

export { Root as Tooltip, Trigger as TooltipTrigger, Content as TooltipContent, Provider as TooltipProvider };
