/**
 * ContextMenu (Radix → bits-ui ContextMenu).
 *
 * Caller translation:
 * - `<ContextMenuTrigger asChild><div …/></ContextMenuTrigger>` →
 *   `<ContextMenuTrigger>{#snippet child({ props })}<div {...props} …/>{/snippet}</ContextMenuTrigger>`
 *   (ContextMenuTrigger still adds `select-none` via `class`; with `child`, the merged
 *   `class` is in `props`). `onContextMenuCapture` / `onPointerDownCapture` →
 *   `oncontextmenucapture` / `onpointerdowncapture`.
 * - ContextMenu: `onOpenChange` works (bits also allows `bind:open`).
 * - `ContextMenuItem onSelect={(e) => …}` unchanged (`e.preventDefault()` keeps it open);
 *   `variant`, `inset`, `disabled`; `asChild` → `child` snippet.
 * - ContextMenuCheckboxItem: `checked: boolean | "indeterminate"` + `onCheckedChange`
 *   (or `bind:checked`); `onSelect` with `e.preventDefault()` keeps the menu open, as in Radix.
 * - ContextMenuContent: Portal built in; bits defaults `side="right"`,
 *   `sideOffset={2}`, `align="start"` match Radix; `loop={false}` (Radix default).
 * - ContextMenuSubContent renders in place (no portal). ContextMenuLabel is a plain div.
 * - CSS vars: `--radix-context-menu-*` → `--bits-context-menu-*`.
 */
import ContextMenu from "./context-menu.svelte"
import ContextMenuTrigger from "./context-menu-trigger.svelte"
import ContextMenuContent from "./context-menu-content.svelte"
import ContextMenuItem from "./context-menu-item.svelte"
import ContextMenuCheckboxItem from "./context-menu-checkbox-item.svelte"
import ContextMenuRadioItem from "./context-menu-radio-item.svelte"
import ContextMenuLabel from "./context-menu-label.svelte"
import ContextMenuSeparator from "./context-menu-separator.svelte"
import ContextMenuShortcut from "./context-menu-shortcut.svelte"
import ContextMenuGroup from "./context-menu-group.svelte"
import ContextMenuPortal from "./context-menu-portal.svelte"
import ContextMenuSub from "./context-menu-sub.svelte"
import ContextMenuSubContent from "./context-menu-sub-content.svelte"
import ContextMenuSubTrigger from "./context-menu-sub-trigger.svelte"
import ContextMenuRadioGroup from "./context-menu-radio-group.svelte"

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}
