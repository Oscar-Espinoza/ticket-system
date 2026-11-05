/**
 * Input (React: src/components/ui/input.tsx).
 *
 * Caller translation:
 * - `value={v} onChange={(e) => setV(e.target.value)}` → `bind:value={v}` (or `value={v}` +
 *   `oninput={(e) => …e.currentTarget.value}`).
 * - `type="file"`: use `bind:files` (value binding is not allowed on file inputs in Svelte).
 * - `ref` → `bind:ref`; `className` → `class`; `onKeyDown` → `onkeydown`, etc.
 * - `data-slot` can be overridden by passing `data-slot` (InputGroupInput does this).
 */
import Root from "./input.svelte"

export { Root as Input }
