/*
 * Port of src/components/ui/progress.tsx (Radix Progress → bits-ui Progress).
 *
 * Caller translation: `<Progress value={pct} class="w-16" aria-label="…" />` (was `className`).
 * `value` null/undefined = indeterminate; `max` defaults to 100. The indicator offset uses the
 * same `100 - value` formula as the React file (it ignores `max`, like React did).
 * Styling: Root `data-state` is bits' `loading | loaded | indeterminate` (Radix: `complete`
 * instead of `loaded`); the indicator div carries Radix's `data-state/value/max` attributes.
 */
import Root from './progress.svelte';

export { Root as Progress };
