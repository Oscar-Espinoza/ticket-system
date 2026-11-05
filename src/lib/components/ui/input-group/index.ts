/**
 * InputGroup (React: src/components/ui/input-group.tsx).
 *
 * Caller translation:
 * - Same parts and props: InputGroupAddon `align` ("inline-start" | "inline-end" |
 *   "block-start" | "block-end"), InputGroupButton `size` ("xs" | "sm" | "icon-xs" |
 *   "icon-sm", default "xs"), `variant` (default "ghost"), `type` (default "button").
 * - InputGroupInput / InputGroupTextarea: `bind:value` (or `value` + `oninput`), `bind:ref`.
 * - Clicking an addon (outside a button) focuses the group's input, as in React; passing
 *   your own `onclick` replaces that behaviour (React spread order).
 * - `className` → `class`; `onClick` → `onclick`.
 */
import InputGroup from "./input-group.svelte"
import InputGroupAddon from "./input-group-addon.svelte"
import InputGroupButton from "./input-group-button.svelte"
import InputGroupText from "./input-group-text.svelte"
import InputGroupInput from "./input-group-input.svelte"
import InputGroupTextarea from "./input-group-textarea.svelte"

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
export {
  inputGroupAddonVariants,
  inputGroupButtonVariants,
  type InputGroupAddonAlign,
  type InputGroupButtonSize,
} from "./input-group-variants"
