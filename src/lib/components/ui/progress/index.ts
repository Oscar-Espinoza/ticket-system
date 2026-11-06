/*
 * Progress on bits-ui.
 *
 * `value` null/undefined = indeterminate; `max` defaults to 100. The indicator offset uses a
 * `100 - value` formula that ignores `max`.
 * Styling: Root `data-state` is bits' `loading | loaded | indeterminate` (Radix: `complete`
 * instead of `loaded`); the indicator div carries Radix's `data-state/value/max` attributes.
 */
import Root from './progress.svelte';

export { Root as Progress };
