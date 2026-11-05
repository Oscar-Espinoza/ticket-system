/*
 * Port of src/components/ui/toggle.tsx (Radix Toggle → bits-ui Toggle).
 *
 * Caller translation:
 * - `<Toggle pressed={x} onPressedChange={fn}>` keeps working; `bind:pressed={x}` also works.
 *   `defaultPressed` is supported.
 * - `className` → `class`; `asChild` → `{#snippet child({ props })}<el {...props} />{/snippet}`.
 * - `toggleVariants({ variant, size, className })` is the same cva helper as in React.
 * - Styling: bits sets `data-state="on|off"` and `aria-pressed`, same as Radix.
 */
import Root, { toggleVariants, type ToggleSize, type ToggleVariant, type ToggleVariants } from './toggle.svelte';

export { Root as Toggle, toggleVariants, type ToggleSize, type ToggleVariant, type ToggleVariants };
