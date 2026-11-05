/**
 * DropdownMenu (React: src/components/ui/dropdown-menu.tsx, Radix → bits-ui DropdownMenu).
 *
 * Caller translation:
 * - `<DropdownMenuTrigger asChild><Button …/></DropdownMenuTrigger>` →
 *   `<DropdownMenuTrigger>{#snippet child({ props })}<Button {...props} …/>{/snippet}</DropdownMenuTrigger>`.
 * - DropdownMenuTrigger defaults `type="button"` like Radix (also in the `child` snippet props).
 * - `<DropdownMenuItem asChild><Link href>…</Link></DropdownMenuItem>` →
 *   `<DropdownMenuItem>{#snippet child({ props })}<a {...props} href>…</a>{/snippet}</DropdownMenuItem>`.
 * - `open` / `onOpenChange` on DropdownMenu and DropdownMenuSub work as in React (also
 *   `bind:open`, `defaultOpen`).
 * - `DropdownMenuItem onSelect={(e) => …}` unchanged: `e.preventDefault()` keeps the menu open.
 *   Props `variant` ("default" | "destructive"), `inset`, `disabled`, `textValue` as in React.
 * - DropdownMenuCheckboxItem: `checked: boolean | "indeterminate"` + `onCheckedChange` (or
 *   `bind:checked`); closes on select like Radix (bits `closeOnSelect` default true kept).
 * - DropdownMenuRadioGroup: `value` + `onValueChange` (or `bind:value`); RadioItem `value`.
 * - DropdownMenuContent: Portal is built in (as in React). Defaults `align="start"`,
 *   `sideOffset={4}`, `loop={false}` (Radix default; bits defaults to true). `side`,
 *   `alignOffset`, `collisionPadding`, `avoidCollisions` pass through; `portalProps` → Portal.
 *   `onCloseAutoFocus` unchanged; `onEscapeKeyDown` → `onEscapeKeydown`;
 *   `onPointerDownOutside`/`onInteractOutside` → `onInteractOutside`.
 * - DropdownMenuSubContent renders in place (no portal; Radix needed an explicit Portal too).
 * - DropdownMenuLabel is a plain div (Radix Label was a div with no role).
 * - CSS vars: `--radix-dropdown-menu-*` → `--bits-dropdown-menu-*`
 *   (`trigger-width` → `anchor-width`).
 */
import DropdownMenu from "./dropdown-menu.svelte"
import DropdownMenuPortal from "./dropdown-menu-portal.svelte"
import DropdownMenuTrigger from "./dropdown-menu-trigger.svelte"
import DropdownMenuContent from "./dropdown-menu-content.svelte"
import DropdownMenuGroup from "./dropdown-menu-group.svelte"
import DropdownMenuLabel from "./dropdown-menu-label.svelte"
import DropdownMenuItem from "./dropdown-menu-item.svelte"
import DropdownMenuCheckboxItem from "./dropdown-menu-checkbox-item.svelte"
import DropdownMenuRadioGroup from "./dropdown-menu-radio-group.svelte"
import DropdownMenuRadioItem from "./dropdown-menu-radio-item.svelte"
import DropdownMenuSeparator from "./dropdown-menu-separator.svelte"
import DropdownMenuShortcut from "./dropdown-menu-shortcut.svelte"
import DropdownMenuSub from "./dropdown-menu-sub.svelte"
import DropdownMenuSubTrigger from "./dropdown-menu-sub-trigger.svelte"
import DropdownMenuSubContent from "./dropdown-menu-sub-content.svelte"

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
