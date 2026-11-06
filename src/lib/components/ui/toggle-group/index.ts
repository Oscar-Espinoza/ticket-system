/*
 * Radix ToggleGroup → bits-ui ToggleGroup.
 *
 * Caller translation:
 * - Same props: `type="single" | "multiple"` (required), `variant`, `size`, `spacing` (default 2),
 *   `orientation`, `value` + `onValueChange` (or `bind:value`), `defaultValue`, `disabled`,
 *   `aria-label`, `class` (was `className`).
 * - `onValueChange` gets `string` for single and `string[]` for multiple, like Radix. As in Radix,
 *   a single group calls it with `""` when the pressed item is clicked again; the repo's
 *   `value && …` guards still apply.
 * - Strict control (the value must not change unless the parent accepts it):
 *   `bind:value={() => current, (v) => v && setCurrent(v)}`. Passing `value={x}` only seeds/overrides
 *   the internal state when `x` changes.
 * - Variant/size/spacing flow to items through Svelte context
 *   (`setToggleGroupContext` / `getToggleGroupContext` in ./toggle-group-context.svelte), same
 *   precedence: group value wins over the item's own prop.
 * - Item `asChild` → `{#snippet child({ props, pressed })}…{/snippet}`.
 * - Keyboard: both arrow axes move focus between items whatever `orientation` is, as with Radix
 *   (Radix was never given `orientation`). A caller `onkeydown` on the group still runs first.
 * - Styling: items get `data-state="on|off"` (matches `data-[state=on]:` in toggleVariants).
 */
import Root from './toggle-group.svelte';
import Item from './toggle-group-item.svelte';

export { Root as ToggleGroup, Item as ToggleGroupItem };
export {
  getToggleGroupContext,
  setToggleGroupContext,
  type ToggleGroupContextValue,
} from './toggle-group-context.svelte';
