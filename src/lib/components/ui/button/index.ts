/**
 * Button.
 *
 * - `<Button href="/x">…</Button>` renders an `<a>` with the same classes/data attributes.
 * - Any other element: `<Button>{#snippet child({ props })}<label {...props}>…</label>{/snippet}</Button>`.
 * - `type` has NO default: a bare `<Button>` inside a `<form>` submits.
 * - Inside another primitive's `child` snippet: `<Button {...props} variant="ghost">` (the
 *   primitive's props carry aria/data attributes and event handlers).
 */
import Root, { type ButtonProps } from "./button.svelte"
import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button-variants"

export {
  Root as Button,
  buttonVariants,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
}
