/**
 * Collapsible (Radix → bits-ui Collapsible).
 *
 * Caller translation:
 * - `open` + `onOpenChange` work (also `bind:open`); `defaultOpen` seeds the
 *   uncontrolled state; `disabled` passes through.
 * - `asChild` on Trigger/Content → `{#snippet child({ props })}<button {...props}>…{/snippet}`.
 * - Content height var: `--radix-collapsible-content-height` → `--bits-collapsible-content-height`.
 */
import Collapsible from "./collapsible.svelte"
import CollapsibleTrigger from "./collapsible-trigger.svelte"
import CollapsibleContent from "./collapsible-content.svelte"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
