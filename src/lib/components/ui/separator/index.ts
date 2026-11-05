/*
 * Port of src/components/ui/separator.tsx (Radix Separator → bits-ui Separator).
 *
 * Caller translation: `<Separator class="my-10" />`, `<Separator orientation="vertical" … />`.
 * Defaults as in React: `orientation="horizontal"`, `decorative={true}` (bits' own default is
 * false). `data-slot` can be overridden (other primitives reuse it).
 */
import Root from './separator.svelte';

export { Root as Separator };
