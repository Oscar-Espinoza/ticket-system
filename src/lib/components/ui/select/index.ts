/*
 * Port of src/components/ui/select.tsx (Radix Select → bits-ui Select).
 *
 * Caller translation:
 * - `<Select value={v} onValueChange={fn} disabled={x}>` keeps working (single-value by default,
 *   like Radix — no `type` needed); `bind:value={v}` also works. `type="multiple"` with
 *   `value: string[]` is available. Uncontrolled forms: `name="estimateScale" defaultValue=…`
 *   renders a hidden input as before. Strict control (ignore rejected values):
 *   `bind:value={() => v, (next) => isStatus(next) && setV(next)}`.
 * - IMPORTANT — pass `items` to Select: `items={[{ value, label }]}` (the same list the
 *   SelectItems render). Radix read the selected item's text even while closed; bits only knows
 *   labels from `items`, or from the selected SelectItem's `label`/`textValue`/text content once
 *   that item has mounted (the list has been opened). So without `items` the closed trigger shows
 *   the raw value (e.g. "admin" instead of "Admin") on first render and after every reload, until
 *   the list is opened. `items` also enables typeahead on the closed trigger, as Radix had.
 * - Rich selected content (React showed the item's full ItemText, e.g. Avatar + name or
 *   StateIcon + name): render it with SelectValue's snippet —
 *   `<SelectValue placeholder="Anyone">{#snippet children({ selection })}…{/snippet}</SelectValue>`
 *   where `selection.selected` is `{ value, label } | undefined` (single). Without children it
 *   shows the label, or `placeholder` when empty (trigger gets `data-placeholder`).
 * - SelectTrigger: same props (`size="sm" | "default"`, `id`, `aria-label`, `class`).
 * - SelectContent: same props (`align`, `side`, `sideOffset`, `position`). bits has no
 *   item-aligned mode, so the open list always pops next to the trigger (unavoidable difference);
 *   in both modes it is at least as wide as the trigger, as in Radix. Always portaled. CSS vars:
 *   `--radix-select-trigger-width/height` →
 *   `--bits-select-anchor-width/height`, `--radix-select-content-*` → `--bits-select-content-*`.
 * - SelectItem: `<SelectItem value=… disabled title=… class=…>text</SelectItem>`; `textValue` (or
 *   `label`) sets the trigger text, defaulting to the item's text content once the item has
 *   mounted. Typeahead inside the open list always matches the items' text content.
 * - SelectLabel must be inside SelectGroup (as in Radix). SelectSeparator is a plain div.
 * - Styling: Trigger `data-state`, `data-placeholder`, `data-disabled`; Item `data-highlighted`,
 *   `data-selected`, `data-disabled` (all "" when present).
 */
import Root from './select.svelte';
import Content from './select-content.svelte';
import Group from './select-group.svelte';
import Item from './select-item.svelte';
import Label from './select-label.svelte';
import ScrollDownButton from './select-scroll-down-button.svelte';
import ScrollUpButton from './select-scroll-up-button.svelte';
import Separator from './select-separator.svelte';
import Trigger from './select-trigger.svelte';
import Value from './select-value.svelte';

export {
  Root as Select,
  Content as SelectContent,
  Group as SelectGroup,
  Item as SelectItem,
  Label as SelectLabel,
  ScrollDownButton as SelectScrollDownButton,
  ScrollUpButton as SelectScrollUpButton,
  Separator as SelectSeparator,
  Trigger as SelectTrigger,
  Value as SelectValue,
};
