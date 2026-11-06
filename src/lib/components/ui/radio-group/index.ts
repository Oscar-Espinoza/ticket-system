/*
 * Radix RadioGroup → bits-ui RadioGroup.
 *
 * Caller translation:
 * - `<RadioGroup value={v} onValueChange={fn} disabled class="gap-3" aria-label="…">` keeps
 *   working; `bind:value` also works; `defaultValue`, `name`, `required`, `orientation`, `loop`.
 * - `<RadioGroupItem id=… value=… disabled class=… />` unchanged; pair it with
 *   `<Label for={id}>` (was `htmlFor`).
 * - Styling: items get `data-state="checked|unchecked"` (matches `data-checked:`), `aria-checked`,
 *   `data-disabled`, and the native `disabled` attribute, like Radix.
 */
import Root from './radio-group.svelte';
import Item from './radio-group-item.svelte';

export { Root as RadioGroup, Item as RadioGroupItem };
