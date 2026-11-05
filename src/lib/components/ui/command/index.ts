/**
 * Command (React: src/components/ui/command.tsx, cmdk → bits-ui Command).
 *
 * Caller translation:
 * - `<Command filter={keywordFilter} shouldFilter={false} loop>` unchanged — bits-ui's
 *   `filter(value, search, keywords) => number` has cmdk's signature. `value` /
 *   `onValueChange` (highlighted item) unchanged, plus `bind:value`. React `onKeyDown` →
 *   `onkeydown`; calling `e.preventDefault()` in it skips the built-in key handling, as in cmdk.
 * - `<CommandInput value={search} onValueChange={setSearch} />` unchanged (also
 *   `bind:value`). `autoFocus` → `autofocus`.
 * - `<CommandItem value keywords disabled forceMount onSelect={(value) => …}>` unchanged:
 *   the wrapper passes the item value to `onSelect` like cmdk (bits-ui passes nothing).
 *   `data-checked={bool}` still drives the trailing check icon.
 * - `<CommandGroup heading="Text">` unchanged; a JSX heading → `{#snippet heading()}…{/snippet}`
 *   as a child of CommandGroup. `forceMount`, `value` pass through.
 * - `<CommandSeparator alwaysRender>` unchanged (mapped to bits `forceMount`).
 * - CommandDialog: `open` / `onOpenChange` / `bind:open`, `title`, `description`,
 *   `showCloseButton`, `class`. Like the React version it does NOT wrap children in
 *   `<Command>` — put `<Command>` inside it yourself.
 * - CommandList wraps its children in bits' Viewport (cmdk's list sizer), which enables
 *   score sorting of ungrouped items and groups and the input's `aria-activedescendant`.
 * - Styling attributes: `[cmdk-group-heading]` → `[data-command-group-heading]`,
 *   `[cmdk-item]` → `[data-command-item]`, `data-[selected=true]` → `data-selected`,
 *   `data-[disabled=true]` → `data-disabled`, `--cmdk-list-height` → `--bits-command-list-height`.
 */
import Command from "./command.svelte"
import CommandDialog from "./command-dialog.svelte"
import CommandInput from "./command-input.svelte"
import CommandList from "./command-list.svelte"
import CommandEmpty from "./command-empty.svelte"
import CommandGroup from "./command-group.svelte"
import CommandItem from "./command-item.svelte"
import CommandShortcut from "./command-shortcut.svelte"
import CommandSeparator from "./command-separator.svelte"

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
