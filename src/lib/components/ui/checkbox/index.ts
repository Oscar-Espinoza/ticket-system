/**
 * Checkbox (React: src/components/ui/checkbox.tsx, Radix Checkbox → bits-ui Checkbox).
 *
 * Caller translation: same `checked` / `onCheckedChange` contract as Radix —
 * `checked: boolean | "indeterminate"`, `onCheckedChange(checked)`. `bind:checked` also
 * works. `id`, `name`, `value`, `required`, `disabled` pass through (bits renders a hidden
 * input when `name` is set). `className` → `class`.
 * The indicator renders only while checked or indeterminate (Radix Indicator semantics).
 */
import Root, { type CheckboxProps, type CheckedState } from "./checkbox.svelte"

export { Root as Checkbox, type CheckboxProps, type CheckedState }
