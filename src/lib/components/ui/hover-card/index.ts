/**
 * HoverCard (Radix HoverCard → bits-ui LinkPreview).
 *
 * Caller translation:
 * - `openDelay` / `closeDelay` / `open` / `onOpenChange` / `defaultOpen` on HoverCard as in
 *   (bits defaults 700 / 300 match Radix); `bind:open` also works.
 * - `<HoverCardTrigger asChild><a …/></HoverCardTrigger>` →
 *   `<HoverCardTrigger>{#snippet child({ props })}<a {...props} …/>{/snippet}</HoverCardTrigger>`
 *   (without `child`, bits renders an `<a>` trigger, as Radix did).
 * - HoverCardContent: Portal built in, defaults `side="bottom"`
 *   (Radix Popper default; bits LinkPreview defaults to "top"), `align="center"`,
 *   `sideOffset={4}`; `side` etc. pass through; `portalProps` → Portal.
 * - CSS var: `--radix-hover-card-content-transform-origin` →
 *   `--bits-link-preview-content-transform-origin`.
 */
import HoverCard from "./hover-card.svelte"
import HoverCardTrigger from "./hover-card-trigger.svelte"
import HoverCardContent from "./hover-card-content.svelte"

export { HoverCard, HoverCardTrigger, HoverCardContent }
