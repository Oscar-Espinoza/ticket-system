/**
 * Label (React: src/components/ui/label.tsx, Radix Label → bits-ui Label).
 *
 * Caller translation: `htmlFor` → `for`; `className` → `class`.
 * `group-data-[disabled=true]` is kept as in React: it targets a caller-set parent
 * attribute (e.g. a field wrapper with `data-disabled={true}`), not a bits-ui attribute.
 */
import Root from "./label.svelte"

export { Root as Label }
