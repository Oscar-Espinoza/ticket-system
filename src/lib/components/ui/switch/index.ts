/*
 * Port of src/components/ui/switch.tsx (Radix Switch → bits-ui Switch).
 *
 * Caller translation:
 * - `<Switch id=… size="sm" checked={x} onCheckedChange={fn} disabled aria-label=… />` keeps
 *   working; `bind:checked={x}` also works; `defaultChecked`, `name`, `value`, `required`.
 * - Passing `checked={x}` without binding lets the switch flip immediately and only re-syncs when
 *   `x` changes. Where React relied on strict control (the switch must stay put until a server call
 *   succeeds, e.g. `checked={!!url}`), use a function binding:
 *   `bind:checked={() => !!url, (on) => toggle(on)}`.
 * - Styling: Root and Thumb get `data-state="checked|unchecked"` (matches `data-checked:` /
 *   `data-unchecked:`) and `data-disabled`, like Radix.
 */
import Root from './switch.svelte';

export { Root as Switch };
