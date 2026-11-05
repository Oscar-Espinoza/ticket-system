# Wave 1 APIs (UI primitives, icons, theme, shared state)

Written by the wave-1 builders (W1a, W1b, W1c) and updated by their review fixes. **Wave-2 builders: read this before porting; use these APIs as described.** Where a fix report contradicts the build report, the fix report wins.



---

## Lane W1a: build report

## W1a report: UI primitives part 1

All 15 source files are ported, with nothing left as a TODO or stub. The last `scripts/kit-check.sh` run over all 15 target folders gave **0 errors**. A direct `svelte-check --threshold warning` run also shows 0 warnings in these files.

### 1. Source → target mapping
Everything lives under `/home/oscar/Projects/ticket-system/src/lib/components/ui/`. Each folder has one `.svelte` per part and an `index.ts` that exports the same names as the React file. Each `index.ts` starts with a comment explaining how callers translate.

| React file | Target folder | Files |
|---|---|---|
| alert-dialog.tsx | `alert-dialog/` | 12 parts + `alert-dialog-context.ts` |
| avatar.tsx | `avatar/` | Avatar, Image, Fallback, Badge, Group, GroupCount |
| button.tsx | `button/` | `button.svelte`, `button-variants.ts` (`buttonVariants` cva, identical to React, plus `ButtonVariant`/`ButtonSize`/`ButtonProps` types) |
| calendar.tsx | `calendar/` | `calendar.svelte`, `calendar-day-button.svelte`, `calendar-utils.ts` |
| card.tsx | `card/` | 7 parts |
| checkbox.tsx | `checkbox/` | Checkbox (+ `CheckedState`, `CheckboxProps` types) |
| collapsible.tsx | `collapsible/` | 3 parts |
| command.tsx | `command/` | Command, Dialog, Input, List, Empty, Group, Item, Shortcut, Separator |
| context-menu.tsx | `context-menu/` | 15 parts |
| dialog.tsx | `dialog/` | 10 parts |
| dropdown-menu.tsx | `dropdown-menu/` | 15 parts |
| hover-card.tsx | `hover-card/` | 3 parts (bits-ui LinkPreview) |
| input-group.tsx | `input-group/` | 6 parts + `input-group-variants.ts` (cva, identical) |
| input.tsx | `input/` | Input |
| label.tsx | `label/` | Label |

### 2. API decisions other lanes must know
- **asChild:**
  - `<Button asChild><Link href>` becomes `<Button href="/x">`, which renders an `<a>` with the same classes and data attributes.
  - Every other primitive uses `{#snippet child({ props })}<El {...props}/>{/snippet}` instead of `asChild`. This includes Button for targets other than links.
- **Button:** `type` has no default, same as React. A bare `<Button>` inside a `<form>` submits. It renders `data-variant` and `data-size`.
- **Open state:** `open` + `onOpenChange` work unchanged on Dialog, AlertDialog, DropdownMenu, DropdownMenuSub, ContextMenuSub, HoverCard and Collapsible. `bind:open` and `defaultOpen` also work.
- **AlertDialogAction closes the dialog like Radix did.** bits-ui's own Action doesn't close it, so a small context adds this back. Your `onclick` runs first; calling `event.preventDefault()` keeps the dialog open; closing calls `onOpenChange(false)`. Action and Cancel default to `type="button"`.
- **Content parts render their own Portal and Overlay**, as in React, and accept `portalProps`. Menu sub-content renders in place.
- **Menu content:**
  - DropdownMenuContent defaults to `align="start"`, `sideOffset={4}`.
  - Both menus' Content and SubContent default to `loop={false}` (Radix's default).
  - DropdownMenuSubContent defaults to `align="start"`.
  - The CheckboxItem in both menus closes on select. Its `checked` takes `boolean | "indeterminate"`, with `onCheckedChange`.
- **Event props:**
  - `onSelect(e)` on menu items is unchanged; `e.preventDefault()` keeps the menu open.
  - `onEscapeKeyDown` becomes `onEscapeKeydown`.
  - `onPointerDownOutside` becomes `onInteractOutside`.
  - DOM events are lowercase (`onclick`, `onkeydown`, `oncontextmenucapture`).
  - Label takes `for` instead of `htmlFor`.
- **Command** keeps cmdk's contract:
  - `CommandItem onSelect` receives the item's value; the wrapper adds this because bits-ui passes nothing.
  - `CommandInput` takes `value` + `onValueChange`.
  - `CommandGroup heading` takes a string or a `{#snippet heading()}`.
  - `CommandSeparator` keeps `alwaysRender`.
  - Root props `filter`, `shouldFilter` and `onkeydown` behave the same, including `preventDefault`.
  - `data-checked={bool}` still drives the check icon.
  - CommandDialog does not wrap its children in `<Command>`, same as the React version.
- **Calendar** keeps react-day-picker's contract and uses JS `Date` in both directions:
  - Props: `mode` ("single" or "multiple"), `selected`, `onSelect(date, triggerDate)`, `defaultMonth`, `month`/`onMonthChange`, `startMonth`/`endMonth`, and all the `disabled`/`hidden` matcher shapes.
  - Also: `required`, `autoFocus`, `showOutsideDays`, `captionLayout` (including the dropdowns), `buttonVariant`, `classNames`, `min`/`max`.
  - Passing `onSelect` makes the selection controlled by `selected`, as in react-day-picker. Without it, Calendar keeps its own selection and writes it back through `bind:selected`.
- **Checkbox:** `checked: boolean | "indeterminate"` + `onCheckedChange`, or `bind:checked`.
- **Input / InputGroupInput / InputGroupTextarea:** use `bind:value` (`bind:files` for file inputs) and `bind:ref`.

### 3. Not ported 1:1, and why
- **Calendar:**
  - Range mode, `showWeekNumber`, and react-day-picker's `components`/`formatters`/`modifiers` props aren't supported; the repo doesn't use them.
  - `locale` is a BCP 47 string, not a date-fns Locale.
  - The focus ring uses `focus:` on the day button instead of `group-data-[focused=true]/day:`, because bits-ui's `data-focused` means something different. It looks the same.
  - Day buttons use bits-ui's aria-labels; the month buttons use react-day-picker's labels.
  - `autoFocus` is implemented in the wrapper because bits-ui's `initialFocus` tries to focus the `<td>`, which isn't focusable.
  - With `required`, clicking the selected day does nothing (react-day-picker called `onSelect` again).
- **Attribute renames:**
  - Command: `**:[[cmdk-group-heading]]` becomes `**:data-[command-group-heading]`, and `data-[disabled=true]` becomes `data-disabled`.
  - Calendar: `data-[selected=true]` becomes `data-selected`.
  - The `--radix-*` CSS variables become `--bits-*` (`trigger-width` becomes `anchor-width`; hover-card uses `--bits-link-preview-*`).
- **Behaviour edges:**
  - If a parent passes `open` without `bind:` and ignores `onOpenChange`, the dialog/menu still closes on its own. It is not strictly controlled the way React was.
  - A disabled `<Button href>` drops its `href` and gets `aria-disabled`.
  - Radix Avatar's `Fallback delayMs` goes on `Avatar` instead.
- **data-slot:** values on Root, Portal and Sub parts are omitted; those parts render no DOM in Radix either.
- **Extra exports:** input-group also exports its variant helpers and types, which the React file doesn't. They're harmless.
- **GSD workflow:** the project CLAUDE.md asks for edits to go through a GSD command. I didn't, because this lane's instructions defined the workflow and the global extension policy forbids optional skills.

### 4. Cross-lane imports
- `@/lib/components/ui/textarea` (W1b) is used by InputGroupTextarea. It needs `value` and `ref` to be bindable and must spread the remaining props after its own `data-slot`; it does, and it type-checks.
- Everything else comes from `@/lib/utils` (`cn`), bits-ui 2.20.5, @lucide/svelte 1.17.0, class-variance-authority and @internationalized/date.
- There were no "Cannot find module" errors.

### 5. Last kit-check result
```
kit-check: 0 error(s) in src/lib/components/ui/alert-dialog src/lib/components/ui/avatar src/lib/components/ui/button src/lib/components/ui/calendar src/lib/components/ui/card src/lib/components/ui/checkbox src/lib/components/ui/collapsible src/lib/components/ui/command src/lib/components/ui/context-menu src/lib/components/ui/dialog src/lib/components/ui/dropdown-menu src/lib/components/ui/hover-card src/lib/components/ui/input-group src/lib/components/ui/input/ src/lib/components/ui/label
```


### Lane W1a: review findings (4)

- [major] src/lib/components/ui/hover-card/hover-card-content.svelte: Lines 9-10 and 19-23: the wrapper sets defaults only for align="center" and sideOffset=4 and leaves `side` to bits-ui. bits-ui LinkPreview.Content defaults to `side = "top"` (node_modules/bits-ui/dist/bits/link-preview/components/link-preview-content.svelte:19). Radix HoverCard.Content defaulted to the Popper default, side="bottom". The only caller, src/components/sla/time-in-status.tsx:76 (`<HoverCardContent align="start" className="w-72">`), passes no `side`. So the time-in-status card would open above its trigger instead of below it, which breaks pixel and behaviour parity. The index.ts note says the defaults match React, but this one does not. → Add `side = "bottom"` to the destructured props and pass `{side}` to HoverCardPrimitive.Content. Update the index.ts note to list it.
- [major] src/lib/components/ui/command/command-list.svelte: Lines 12-20 render CommandPrimitive.List without a CommandPrimitive.Viewport. cmdk's List always wrapped its children in an inner sizer div (`[cmdk-list-sizer]`). In bits-ui, only Viewport sets `root.viewportNode` (command.svelte.js:1331), and nothing sets it here, so it stays null. Two things break as a result. (1) Sorting: bits sorts by appending ungrouped items, and whole groups, to `listInsertionElement = this.viewportNode` (command.svelte.js:175-205). With it null, ungrouped items and the group order never re-rank by score. Only items inside a group get sorted. `#selectFirstItem` then highlights the first match in DOM order, not the best match, so Enter can pick a different item than cmdk would. This affects ungrouped pickers such as state-picker, priority-picker, estimate-picker and timezone-picker, and the multi-group lists (cycle-picker, epic-labels, filter-menu, ...). (2) Accessibility: CommandInput's `aria-activedescendant` and `aria-controls` are computed from `viewportNode` (command.svelte.js:1109, 1140), so they are always missing. cmdk set both. → Render the children inside a Viewport, the bits equivalent of cmdk's sizer: `<CommandPrimitive.List bind:ref data-slot="command-list" class={...} {...restProps}><CommandPrimitive.Viewport>{@render children?.()}</CommandPrimitive.Viewport></CommandPrimitive.List>`, destructuring `children` from props. This also makes `--bits-command-list-height` available.
- [minor] src/lib/components/ui/dialog/dialog-trigger.svelte: Radix rendered Dialog/AlertDialog/DropdownMenu Trigger and Dialog Close as `<button type="button">`. With asChild, the Slot also passed `type="button"` down to the child `<Button>`. bits-ui's Trigger and Close props carry no `type` (dialog.svelte.js:125-136 and 167-176; menu-trigger renders a bare `<button>`). The wrappers don't add one either: dialog-trigger.svelte:7, alert-dialog-trigger.svelte:7, dropdown-menu-trigger.svelte:7, dialog-close.svelte:7, and the X button in dialog-content.svelte:37-43 and dialog-footer.svelte:29-33. Button also has no default type. So these buttons, and every `{#snippet child({ props })}<Button {...props}>` caller, become submit buttons when they sit inside a `<form>`. No current call site nests a trigger inside a form, so this is a latent regression rather than an active bug. The builder already applied `type="button"` to AlertDialogAction and AlertDialogCancel. → Default `type = "button"` in the Trigger and Close wrappers (dialog, alert-dialog, dropdown-menu) and pass `{type}` to the bits part. bits merges restProps into the `props` handed to the `child` snippet, so asChild-style callers receive it too. Also set `type="button"` on the Close Buttons in DialogContent and DialogFooter.
- [minor] src/lib/components/ui/alert-dialog/alert-dialog-content.svelte: Line 22: Radix AlertDialogContent's onOpenAutoFocus called preventDefault and focused the Cancel button, so pressing Enter or Space right after opening cancelled. bits-ui AlertDialog.Content focuses the content node instead (bits alert-dialog-content.svelte:51-59). The port doesn't restore Radix's behaviour, so keyboard and screen-reader users land on the dialog container rather than on Cancel. This affects the 28 AlertDialog call sites. → In AlertDialogContent, wrap the caller's `onOpenAutoFocus`. If the caller doesn't call preventDefault, call `e.preventDefault()` and focus `ref?.querySelector('[data-slot=alert-dialog-cancel]')`, falling back to the bits default when no Cancel is present.


### Lane W1a: fix report (wins over the build report)

## W1a fix report: UI primitives part 1

I fixed all 4 review findings and none were skipped. The final kit-check over the lane's 15 target folders shows **0 errors**. I only checked types; I didn't run the app or check behaviour in a browser.

### Findings

1. **HoverCardContent opened on the wrong side: fixed.** In `/home/oscar/Projects/ticket-system/src/lib/components/ui/hover-card/hover-card-content.svelte`, `side` now defaults to `"bottom"` (Radix's default) and is passed to the bits part. bits-ui on its own would open it above the trigger. The note in `hover-card/index.ts` now says this.

2. **CommandList had no Viewport: fixed.** `/home/oscar/Projects/ticket-system/src/lib/components/ui/command/command-list.svelte` now puts its children inside `CommandPrimitive.Viewport`, which plays the part of cmdk's inner sizer. This brings back three things:
   - re-ranking of ungrouped items and of whole groups by score, so the first highlighted item is the best match again;
   - `aria-activedescendant` and `aria-controls` on CommandInput;
   - the `--bits-command-list-height` CSS variable.

   The note in `command/index.ts` now says this.

3. **Triggers and Close buttons could submit a form: fixed.** These now default to `type="button"`: `dialog-trigger.svelte`, `dialog-close.svelte`, `alert-dialog-trigger.svelte` and `dropdown-menu-trigger.svelte`. A caller can still pass its own `type`. bits merges the value into the `props` it hands to a `child` snippet, so a `<Button {...props}>` written that way gets it too. The X button in `dialog-content.svelte` and the Close button in `dialog-footer.svelte` now set `type="button"`. CollapsibleTrigger needed no change because bits already sets it there.

4. **AlertDialog didn't focus Cancel on open: fixed.** `/home/oscar/Projects/ticket-system/src/lib/components/ui/alert-dialog/alert-dialog-content.svelte` now wraps the caller's `onOpenAutoFocus`:
   - The caller's handler runs first. If it calls `e.preventDefault()`, nothing else happens.
   - Otherwise the wrapper looks for `[data-slot="alert-dialog-cancel"]` inside the content. If it finds one, it focuses it after a 0ms timeout, which matches the delay bits uses for its own focus.
   - If there is no Cancel button, bits' default applies and the dialog container gets focus.

### API changes other lanes must know

- **Triggers no longer submit forms.** Dialog, AlertDialog and DropdownMenu triggers, DialogClose and the built-in Close buttons are `type="button"` by default. If a caller relied on one of them submitting a form, it now has to pass `type="submit"`. No current call site does this.
- **HoverCardContent opens below its trigger by default.** Pass `side` to change it.
- **AlertDialogContent focuses Cancel when it opens.** To opt out, pass `onOpenAutoFocus={(e) => e.preventDefault()}` and set focus yourself.
- **Do not wrap CommandList's children in your own element.** CommandList now has an inner Viewport `<div>`, and sorting re-orders the elements directly inside it. If items or groups sit inside an extra wrapper, sorting won't move them.

### Final kit-check
```
kit-check: 0 error(s) in src/lib/components/ui/alert-dialog src/lib/components/ui/avatar src/lib/components/ui/button src/lib/components/ui/calendar src/lib/components/ui/card src/lib/components/ui/checkbox src/lib/components/ui/collapsible src/lib/components/ui/command src/lib/components/ui/context-menu src/lib/components/ui/dialog src/lib/components/ui/dropdown-menu src/lib/components/ui/hover-card src/lib/components/ui/input-group src/lib/components/ui/input/ src/lib/components/ui/label
```


---

## Lane W1b: build report

# W1b report: UI primitives part 2

All 15 source files are ported (72 files under `/home/oscar/Projects/ticket-system/src/lib/components/ui/`). The last `scripts/kit-check.sh` run over my 15 folders reports **0 errors**. A full svelte-check at warning level also showed no warnings in my files. I also type-checked a temporary file that used every component the way the repo's callers do (all 15 primitives); it had no errors, and I deleted it afterwards. Nothing has been run in a browser yet.

## 1. Source → target mapping
Every folder has an `index.ts` that exports the same names as the React file and starts with a comment on how callers translate.

| Source | Target folder | Part files |
|---|---|---|
| popover.tsx | `popover/` | popover, popover-trigger, popover-content, popover-anchor, popover-header, popover-title, popover-description, plus `popover-context.svelte.ts` |
| progress.tsx | `progress/` | progress |
| radio-group.tsx | `radio-group/` | radio-group, radio-group-item |
| scroll-area.tsx | `scroll-area/` | scroll-area, scroll-bar |
| select.tsx | `select/` | select, select-trigger, select-value, select-content, select-group, select-label, select-item, select-separator, select-scroll-up-button, select-scroll-down-button |
| separator.tsx | `separator/` | separator |
| sheet.tsx | `sheet/` | sheet, sheet-trigger, sheet-close, sheet-content, sheet-header, sheet-footer, sheet-title, sheet-description, plus internal sheet-portal and sheet-overlay (not exported, as in React) |
| sonner.tsx | `sonner/` | sonner (exports `Toaster`) |
| switch.tsx | `switch/` | switch |
| table.tsx | `table/` | table, table-header, table-body, table-footer, table-row, table-head, table-cell, table-caption |
| tabs.tsx | `tabs/` | tabs, tabs-list (holds `tabsListVariants`), tabs-trigger, tabs-content |
| textarea.tsx | `textarea/` | textarea |
| toggle-group.tsx | `toggle-group/` | toggle-group, toggle-group-item, plus `toggle-group-context.svelte.ts` |
| toggle.tsx | `toggle/` | toggle (holds `toggleVariants`, built with cva) |
| tooltip.tsx | `tooltip/` | tooltip, tooltip-trigger, tooltip-content, tooltip-provider |

## 2. API decisions other lanes must know
- **Names and types:** every React export name is kept. Also exported: `toggleVariants` with types `ToggleVariants`, `ToggleVariant`, `ToggleSize`; `tabsListVariants` with types `TabsListVariants`, `TabsListVariant`; type `SheetSide`; and `getToggleGroupContext` / `setToggleGroupContext` / `ToggleGroupContextValue`.
- **Open, value and checked state:** every root that had one supports both the React pair (`value` + `onValueChange`, `open` + `onOpenChange`, …) and `bind:`. The Radix `default*` props work too: `defaultValue` on Select, Tabs, RadioGroup and ToggleGroup; `defaultOpen` on Popover, Tooltip, Sheet and Select; `defaultChecked` on Switch; `defaultPressed` on Toggle.
- **Strictly controlled values:** passing `checked={x}` without binding lets the control change at once, and it only re-syncs when `x` changes. Where React kept the control still until the parent agreed (e.g. intake-settings `checked={!!url}`, customer-dialog's `isCustomerStatus(v) && …`), use a function binding: `bind:checked={() => x, (v) => …}`.
- **`asChild`** becomes `{#snippet child({ props })}<el {...props}/>{/snippet}` on Trigger, Close and Anchor.
- **Select is single-value by default** (no `type` needed, like Radix); `type="multiple"` also works. **Callers must pass `items={[{ value, label }]}` to Select.** Without it the closed trigger shows the raw value ("admin" instead of "Admin") until the list has been opened once. Where React's trigger showed rich content (Avatar + name in audit-filter-bar, StateIcon + name in github-settings, the colour dot in insights-view), use `<SelectValue>{#snippet children({ selection })}…{/snippet}</SelectValue>`. `SelectItem` accepts `textValue` or `label`.
- **Popover:**
  - `PopoverContent` keeps `align="center"` and `sideOffset={4}`, and is always portaled.
  - Its `trapFocus` default is `false`, matching Radix's non-modal popover (bits defaults to `true`).
  - `PopoverAnchor` is built from a Svelte context plus bits' `customAnchor`.
  - Caller CSS variables change: `w-(--radix-popover-trigger-width)` in repo-picker becomes `w-(--bits-popover-anchor-width)`.
- **Tooltip:** `TooltipContent` defaults to `side="top"`, because bits defaults to bottom. `TooltipProvider` defaults to `delayDuration=0`. A Provider ancestor is required, so the root layout (W1c) must render `<TooltipProvider>`.
- **Event renames in callers:**
  - `onEscapeKeyDown` → `onEscapeKeydown`
  - `onPointerDownOutside` / `onInteractOutside` → `onInteractOutside`
  - `onClick` → `onclick`
  - Textarea `onChange` → `bind:value` or `oninput`
- **ToggleGroup context:** variant, size, spacing and orientation are shared through `createContext`. The group's values win over an item's own props, as in React, and items outside a group fall back to React's context defaults.
- **Toaster** uses svelte-sonner with the same icons, CSS variables and `cn-toast` class (`classNames` → `classes`). Its theme is `mode.current ?? 'system'` from mode-watcher.

## 3. Not ported 1:1, and why
- **Select position:** bits has no `position="item-aligned"`, so the open list always opens next to the trigger instead of over it. That is the one visible difference. I kept `data-align-trigger`, so the default mode still has no open/close animation, as in React.
- **Select highlight:** bits highlights items with a data attribute rather than real focus, so I added `data-highlighted:` copies of the `focus:` classes, as the reference instructs.
- **TabsContent:** bits keeps inactive panels mounted. The wrapper renders the hidden panel but unmounts its children, matching Radix, and `forceMount` is supported.
- **Tooltip arrow:** it uses the shadcn-svelte arrow classes (the React classes plus per-side offsets for how bits positions the arrow), as the reference says.
- **Progress:** bits' root reports `data-state="loaded"` where Radix said `"complete"`. The indicator div carries Radix's own state, value and max attributes. The fill formula is copied from React, so it still ignores `max`.
- **Popover `modal`:** bits has no equivalent, and no caller uses it.
- **Loader icon:** `Loader2Icon` is imported from `@lucide/svelte/icons/loader-circle`. The `loader-2` path has no type file in 1.17.0; it is the same glyph.

## 4. Cross-lane imports I rely on
- `@/lib/components/ui/button` (W1a), used by the Sheet close button. It exists and type-checks.
- `@/lib/utils` (`cn`), unchanged.
- Packages: `bits-ui`, `class-variance-authority`, `svelte-sonner`, `mode-watcher`, `@lucide/svelte`.

**For the coordinator:** the Next `tsconfig.json` includes `**/*.ts` and does not exclude `src/lib/components`. The `index.ts` barrels there (mine and W1a's) import `.svelte` files, and there is no `declare module '*.svelte'`, so Next's type check will probably fail on them. Adding `"src/lib/components"` to that tsconfig's `exclude` should fix it. I didn't edit it because the lane rules reserve tsconfig files for you.

## 5. Last kit-check result
```
kit-check: 0 error(s) in src/lib/components/ui/popover src/lib/components/ui/progress src/lib/components/ui/radio-group src/lib/components/ui/scroll-area src/lib/components/ui/select src/lib/components/ui/separator src/lib/components/ui/sheet src/lib/components/ui/sonner src/lib/components/ui/switch src/lib/components/ui/table src/lib/components/ui/tabs src/lib/components/ui/textarea src/lib/components/ui/toggle-group src/lib/components/ui/toggle src/lib/components/ui/tooltip
```
There were no "Cannot find module" errors.


### Lane W1b: review findings (5)

- [major] src/lib/components/ui/select/select-content.svelte: The open list no longer matches the trigger's width. In React's default `position="item-aligned"` mode, Radix sets the content wrapper's `minWidth` to the trigger width (`@radix-ui/react-select` index.mjs:531-556: `contentWrapper.style.minWidth = minContentWidth`). The port defaults to `position='item-aligned'` but puts the anchor-width minimum only under `data-[position=popper]:min-w-(--bits-select-anchor-width)` (line 53). The default mode therefore gets just `min-w-36`, so the list can be much narrower than its trigger. 15 repo callers use `<SelectTrigger className="w-full">` and 4 more use `w-full max-w-xs`; their lists shrink to about 144px or their content width. This is a second visible difference beyond position, although the report says position is the only one. The shadcn-svelte nova source always applies `min-w-(--bits-select-anchor-width)` to the Viewport. → Apply the anchor-width minimum in both modes. For example, set the Viewport class to `min-w-(--bits-select-anchor-width) data-[position=popper]:h-(--bits-select-anchor-height) data-[position=popper]:w-full`, or add `min-w-(--bits-select-anchor-width)` to Content when `position === 'item-aligned'`.
- [minor] src/lib/components/ui/select/select-item.svelte: Line 31 passes `label={label ?? textValue}`, which is `undefined` when the caller gives neither. bits SelectItem then falls back to `label = value` (bits select-item.svelte:15). `resolveItemLabel` uses the item's text content only when the label is empty, and `getLabelForValue` returns `value` (select.svelte.js:150-162). So without `items`, the closed trigger shows the raw value ("admin") forever, even after the list has been opened. The report and select/index.ts say this lasts only "until the list has been opened once", and index.ts says `textValue` defaults to the item's text content. Both statements are wrong. React's SelectValue always showed the ItemText. → Pass `label={label ?? textValue ?? ''}` so bits falls back to the item's text content (the cached selected label) once the item mounts, and keep the `{label ?? textValue ?? value}` fallback text. Then correct the select/index.ts comment. Passing `items` is still needed for the first closed render.
- [minor] src/lib/components/ui/progress/progress.svelte: `value` is destructured and forwarded as `{value}`. When a caller leaves it undefined, bits applies its default `value = 0` (bits progress.svelte:12), so the root reports `data-state="loading"` and `aria-valuenow=0`. Radix treated an undefined value as indeterminate. The indicator div (line 21) does compute `indeterminate` for the same input, so the root and indicator disagree. index.ts also says 'value null/undefined = indeterminate'. The current callers always pass a number. → Forward `value={value ?? null}` so undefined maps to bits' indeterminate state, as in Radix.
- [minor] src/lib/components/ui/toggle-group/toggle-group.svelte: The React ToggleGroup destructures `orientation` and only renders it as `data-orientation`; it never passes it to Radix Root. Radix's roving focus therefore had no orientation, and both arrow axes moved focus. The port passes `{orientation}` (default 'horizontal') to bits Root at line 59, and bits' roving focus then honours only the horizontal arrow keys. Up/Down no longer move between items in the 13 horizontal groups. → For keyboard parity, pass `data-orientation={orientation}` for styling and leave bits' `orientation` unset, or set it explicitly to match the React behaviour. Otherwise, document this as a deliberate difference.
- [minor] tsconfig.json: This one is for the coordinator; the lane may not edit tsconfig. The Next tsconfig includes `**/*.ts` and excludes neither `src/lib/components` nor `*.svelte.ts`. So this lane's `index.ts` barrels (which import `.svelte` files and have no `*.svelte` module declaration) and `popover-context.svelte.ts` / `toggle-group-context.svelte.ts` (which use runes) will be type-checked by Next. PLAN.md convention 7 assumes these are excluded. The builder flagged this correctly. → The coordinator should add `src/lib/components` (and `**/*.svelte.ts`) to the Next tsconfig.json `exclude`.


### Lane W1b: fix report (wins over the build report)

I fixed four of the five findings and left the tsconfig one to you, since lane rules don't let me edit tsconfig. The last kit-check over all 15 lane folders reports 0 errors. None of the fixes has been run in a browser; kit-check only confirms they type-check.

## Findings

1. **Select list narrower than its trigger (major): fixed.** In `src/lib/components/ui/select/select-content.svelte`, the Viewport class is now `min-w-(--bits-select-anchor-width) data-[position=popper]:h-(--bits-select-anchor-height) data-[position=popper]:w-full`. The list is at least as wide as the trigger in both `item-aligned` and `popper` modes, as in Radix. I updated the comments in that file and in `select/index.ts` (the position difference is the only remaining visible one).

2. **SelectItem label stuck on the raw value (minor): fixed.** `src/lib/components/ui/select/select-item.svelte` now passes `label={label ?? textValue ?? ''}`. With an empty label, bits uses the item's text content and remembers it once the selected item has mounted (checked in bits `select.svelte.js`). The fallback text `{label ?? textValue ?? value}` is unchanged. I corrected `select/index.ts`: without `items`, the closed trigger shows the raw value on first render and after every reload, until the list is opened.

3. **Progress with undefined value (minor): fixed.** `src/lib/components/ui/progress/progress.svelte` forwards `value={value ?? null}`, so undefined is indeterminate, as in Radix. The root and the indicator div now agree, and the "null/undefined = indeterminate" comment in `index.ts` is now accurate.

4. **ToggleGroup arrow keys (minor): fixed, in a different way than suggested.** Leaving bits' `orientation` unset doesn't work: bits defaults it to `'horizontal'` and only ever answers one arrow axis.
   - `src/lib/components/ui/toggle-group/toggle-group.svelte` now has its own `onkeydown`. When a key on the other axis is pressed on an item, it is re-sent to that item as the matching bits key. Up/Down then work in horizontal groups and Left/Right in vertical ones, with right-to-left text handled.
   - Because bits does the actual move, wrap-around and the Tab stop stay correct.
   - The re-sent event is stopped at the group, so caller handlers never see it.
   - A caller's `onkeydown` on the group still runs first; if it calls `preventDefault`, the extra key handling is skipped.
   - `orientation` is still passed to bits, so `data-orientation` and styling are unchanged.
   - I documented this in `toggle-group/index.ts`.

5. **`tsconfig.json` (coordinator): not done, needs you.** Please add `"src/lib/components"` and `"**/*.svelte.ts"` to the `exclude` in the Next `tsconfig.json`. Otherwise Next's type check will try to check the `index.ts` files that import `.svelte` components, and the two `*-context.svelte.ts` files.

## API changes other lanes must know
- No props or export names changed.
- Select lists now always match at least the trigger's width.
- Passing `items={[{ value, label }]}` to Select is still needed for a correct closed trigger on first render.
- `<Progress>` without a `value` is now indeterminate.
- ToggleGroup accepts both arrow axes for moving between items; a caller `onkeydown` on the group is still supported.

## Final kit-check
```
kit-check: 0 error(s) in src/lib/components/ui/popover src/lib/components/ui/progress src/lib/components/ui/radio-group src/lib/components/ui/scroll-area src/lib/components/ui/select src/lib/components/ui/separator src/lib/components/ui/sheet src/lib/components/ui/sonner src/lib/components/ui/switch src/lib/components/ui/table src/lib/components/ui/tabs src/lib/components/ui/textarea src/lib/components/ui/toggle-group src/lib/components/ui/toggle src/lib/components/ui/tooltip
```
After the last `index.ts` comment edit I ran svelte-check again; it found no errors in `ui/toggle-group`.


---

## Lane W1c: build report

# W1c report: shared client state, icons, theme, root layout

All 18 source files are ported, with no stubs or TODOs. `kit-check` on my paths shows 3 errors, all "Cannot find module" for files the Views lane hasn't written yet. The bigger news is two problems outside my lane, covered in section 3.

## 1. Source → target mapping

| Source | Target(s) |
|---|---|
| `ui-icons/status-icon.tsx` | `src/lib/components/ui-icons/status-icon.svelte`, `state-icon.svelte` |
| `ui-icons/priority-icon.tsx`, `label-chip.tsx`, `avatar.tsx`, `empty-state.tsx` | `ui-icons/<same>.svelte` |
| `ui-icons/skeleton.tsx` + `skeleton.module.css` | `ui-icons/skeleton.svelte` (the CSS is now a scoped `<style>`) |
| `ui-icons/index.ts` | `ui-icons/index.ts` (same export names; prop types exported from each component's `<script module>`) |
| `theme-provider.tsx` | `src/lib/svelte/theme.svelte.ts`, `src/lib/svelte/theme-provider.svelte` |
| `project/project-data.tsx` | `project/project-data.svelte.ts`, `project/project-data-provider.svelte` |
| `issues/selection.tsx` | `issues/selection.svelte.ts`, `issue-selection-provider.svelte`, `select-checkbox.svelte` |
| `issues/display-options.tsx` | `issues/display-options.svelte.ts`, `display-options-provider.svelte` |
| `issues/issue-filters.tsx` | `issues/issue-filters.svelte.ts` (state), `issue-filters-provider.svelte`, `issue-filters.svelte` (the `IssueFilters` toolbar component) |
| `issues/use-issue-mutations.ts` | `issues/use-issue-mutations.svelte.ts` |
| `views/view-context.tsx` | `views/view-context.svelte.ts`, `views/issues-view-context-provider.svelte` |
| `navigation/saved-view-context.tsx` | `navigation/saved-view-context.svelte.ts`, `saved-view-provider.svelte` |
| `editor/context.tsx` | `editor/context.svelte.ts`, `editor/rich-editor-provider.svelte` |
| `hooks/use-logout.ts` | `src/lib/svelte/use-logout.svelte.ts` |
| `lib/auth-client.ts`, `undo.ts`, `palette-commands.ts`, `hotkeys.ts`, `sync/outbox.ts` | `src/lib/svelte/auth-client.ts`, `undo.svelte.ts`, `palette-commands.svelte.ts`, `hotkeys.svelte.ts`, `outbox.svelte.ts` |
| `app/layout.tsx` | `src/routes/+layout.svelte` |
| (new, needed by the filters) | `src/lib/svelte/search-params.svelte.ts` |

All component paths above are under `src/lib/components/`.

## 2. API decisions other lanes must know

**General rules**
- Every provider is two things: `setXContext(getter)`, called during component init with a getter, and a `<XProvider>` component with the React props.
- Hooks keep their React names.
- Hooks that returned a plain value in React now return `{ readonly current }`. Read `.current` in markup or `$derived`, and never destructure.

**Project data**
- `useProjectData()` returns a live view: `data.states` and `data.project.role` always read the latest layout data. Destructuring takes a snapshot.
- `useOptionalProjectData()` returns the same view, or `null` outside a project.
- `useProjectPermission(level)` returns `{ current: boolean }`.
- Provider: `setProjectDataContext(() => data)` or `<ProjectDataProvider value={data}>`.

**Display options**
- `const d = useDisplayOptions()`, then read `d.current` and write with `d.set(next)`. This replaces the React tuple `[display, setDisplay]`.
- `<DisplayOptionsProvider initial persist>`. Persisted options render the defaults on the server and during hydration, then the stored value, as React did.

**Filters**
- Import the state with its extension: `'@/lib/components/issues/issue-filters.svelte.ts'`. Without it, `'…/issue-filters.svelte'` resolves to the `IssueFilters` component.
- `useIssueFilters()` returns `{ current }`. Also exported: `useSetIssueFilters()`, `setIssueFilters`, `applyFilters`, `clearFilters`, `setSearchParams`.
- `<IssueFiltersProvider initial>`.

**URL search params**
- `setSearchParams` (re-exported from `@/lib/svelte/search-params.svelte`) is now a shallow `goto` that keeps `page.state`, focus and scroll, and runs no load functions.
- The new URL lands in `page.shallow.url`, not `page.url`. Anything that reads params written this way (filters, `?issue=` pane, the `open-issue` lane) must use `useSearchParams()` from that module. It has the same methods as `URLSearchParams` and is reactive. `currentUrl()` is also exported.
- The navigation progress indicator should ignore shallow navigations.

**Selection**
- `useIssueSelection()` returns `IssueSelection`; `.get()` and `.selected` are reactive.
- `useSelectedIds()`, `useIsSelected(id | () => id)` and `useHasSelection()` each return `{ current }`.
- `handleSelectionClick(sel, event, id)`, `preventShiftSelect`, `orderedIssueIds`, `ISSUE_ITEM`, `VIEW_SCOPE`, `isEditableTarget` and `hasOpenLayer` are unchanged.
- `<IssueSelectionProvider issues>`.
- `<SelectCheckbox checked onToggle label tabIndex class>`.

**Mutations**
- `const m = useIssueMutations(() => issues, { include })`. The issues argument must be a getter; options may also be a getter.
- `m.issues` is a reactive getter. Every other member keeps its React signature. The pure helpers are unchanged.

**Views, saved views, editor**
- `useSubIssueCount(id | () => id)` and `useSavedView()` (view-context) return `{ current }`. Provider: `<IssuesViewContextProvider value>`.
- `useSavedView()` (saved-view-context) returns `{ current }`. Also `canonicalJson`, and `<SavedViewProvider view>`.
- `useRichEditorContext()` returns a live view or `null`. Provider: `<RichEditorProvider value>`. `AnyExtension` now comes from `@tiptap/core`.

**Theme**
- `useTheme()` returns `{ theme, resolvedTheme, systemTheme, themes, setTheme }`, all reactive getters. `setTheme('system')` calls `resetMode()`.

**Hotkeys**
- `registerHotkeys` and `formatHotkey` are unchanged. Use them inside `$effect(() => registerHotkeys([...]))`.
- `registeredHotkeys.current` is the reactive list for the `?` overlay.
- `hasOpenLayer()` checks bits-ui's `[data-bits-floating-content-wrapper]` instead of Radix's popper wrapper.

**Palette commands, outbox, undo, logout, auth**
- `registerPaletteCommands` is unchanged; `paletteCommands.current` is the reactive list.
- `useOutboxItems()` returns `{ current }`. `setSyncUser`, `flush`, `perform`, `isQueued` and `peekOutbox` are unchanged.
- Undo keeps the same exports and uses `svelte-sonner`.
- `useLogout()` returns `{ logout, loading }`. `loading` is a getter. After sign-out it calls `goto('/login', { refreshAll: true })`.
- `authClient` comes from `better-auth/svelte`.

**Root layout and Toaster**
- The root layout renders the single app-wide `<Toaster position="bottom-right">`. The `topbar-chrome` port must not render a second one.
- Pages outside the dashboard (login, invite) now show toasts too; in React only the topbar mounted a Toaster.
- The spot for L1 is a marked comment block at the end of `+layout.svelte`.

## 3. Not ported 1:1, and why

- **Problem 1: mutations don't refresh the page.** The action generator (`scripts/gen-remote-actions.mjs`) only spots `revalidatePath` written directly inside an action. `tickets.ts` calls it through the `revalidateProject()` helper, so `updateIssue`, `createTicket` and the other ticket actions are generated with refresh `false`. `runOutboxCall` is also `false`.
  - In `outbox.svelte.ts`, `send` now calls `refreshAll()` itself after every successful call, replays included. This matches Next, where revalidation came back with the action response. Optimistic ops are dropped only after that refresh.
  - Other lanes that call `@/lib/actions/tickets` directly will not refresh after a mutation until the generator is fixed. That is your call.
- **Problem 2: two hotkey registries.** `productivity/new-issue-bus.ts`, which is on the plan's reuse-as-is list, imports `'@/lib/hotkeys'`. It would therefore add a second keydown listener that uses the old Radix layer test, and its `c` shortcut would be missing from the `?` overlay. The Productivity lane needs a Svelte copy that imports `@/lib/svelte/hotkeys.svelte`.
- **Outbox is a full copy.** `src/lib/sync/outbox.ts` imports `react`, React `sonner` and `@/app/actions/sync` directly, so its exports can't be reused. I did not edit that file. The copy uses the same IndexedDB store, channel and lock names.
- **Palette commands are re-exported.** `palette-commands.svelte.ts` re-exports the React-free registry, so there is one list per tab, and adds the reactive view.
- **`auth-client` has no `baseURL`.** It uses same-origin `/api/auth`. React pointed at `NEXT_PUBLIC_APP_URL`, which during the migration is the Next app's origin.
- **`IssueFilters` inlines `appendToken`.** It is a 3-line copy of the helper in `search-syntax-help`, which avoids depending on how the Views lane exports a non-component function from a `.svelte` file. `FilterPropertyId` is derived from `ComponentProps<typeof FilterMenu>['property']`.
- **mode-watcher works at the type level but is untested in a running app.** It compiles and type-checks; I couldn't run it because no dev server is allowed. Its source handles `modeStorageKey="theme"`, the `defaultMode` fallback and cross-tab sync. If it misbehaves, the fallback only touches `theme.svelte.ts` and `theme-provider.svelte`; the API stays the same.

## 4. Cross-lane imports I rely on

- **W1a:** `@/lib/components/ui/avatar` (`Avatar`, `AvatarFallback`, `AvatarImage`, `size` prop) and `@/lib/components/ui/button` (`Button`, `variant`, `size`, `onclick`). Both exist and type-check.
- **W1b:** `@/lib/components/ui/tooltip` (`TooltipProvider`) and `@/lib/components/ui/sonner` (`Toaster`). Both exist.
- **Views lane, not written yet:** `@/lib/components/views/filter-menu.svelte` (`FilterMenu` with the React props), `filter-chips.svelte` (`FilterChips`) and `search-syntax-help.svelte` (`SearchSyntaxHelp` with `note`, `onInsert`).
- **Generated, unchanged:** `@/lib/actions/sync` (`runOutboxCall`, `OutboxSuspended`).
- **Shared modules, unchanged:** `@/lib/sync/{actions,broadcast}`, `@/lib/{issue-model,issue-filtering,issue-grouping,workflow,roles,project-data-types,palette-commands,utils}`.

## 5. Last kit-check result

```
"src/lib/components/issues/issue-filters.svelte" 13:26 "Cannot find module '@/lib/components/views/filter-menu.svelte' …"
"src/lib/components/issues/issue-filters.svelte" 14:27 "Cannot find module '@/lib/components/views/filter-chips.svelte' …"
"src/lib/components/issues/issue-filters.svelte" 15:32 "Cannot find module '@/lib/components/views/search-syntax-help.svelte' …"
kit-check: 3 error(s)
```

All three are the expected missing Views-lane files. A separate svelte-check run with warnings enabled showed no warnings in my files.


### Lane W1c: review findings (4)

- [major] src/lib/svelte/search-params.svelte.ts: setSearchParams (line 36) does `goto(url, { shallow: true, replace: true })`. In Kit 3, a shallow goto runs the full navigation path. In node_modules/@sveltejs/kit/src/runtime/client/client.js, update_state (~line 2908-2915) calls _before_navigate and sets `navigation_token = invalidation_token = nav_token`. _invalidate (line 610) then drops any in-flight refreshAll result whose token was replaced: `if (... token !== invalidation_token || nav_token !== navigation_token) return;`. The new outbox.svelte.ts `send` awaits refreshAll() after every mutation, and use-issue-mutations drops the optimistic op as soon as that call settles. Concrete case: change an issue's status, then open the pane (setSearchParams({issue})) or type in the quick filter before the refresh returns. The refresh is thrown away, the op is removed, and the row falls back to the old server data until some later refresh. React used window.history.replaceState, which touches neither the router data nor navigation. The same path also fires beforeNavigate/onNavigate/afterNavigate and sets `navigating` on every filter commit and every pane open or close. A beforeNavigate guard in another lane that calls cancel() would silently stop the URL write while `filters` has already changed locally. The URL is also written only after `await resolve_intent`, so two setSearchParams calls in the same tick both read the old window.location.search and the second overwrites the first. React's write was synchronous. → Write the URL without going through goto navigation. One option is `replaceState(url, page.state)` from $app/navigation: it still exists in Kit 3, and with caller 'replaceState' update_state skips _before_navigate and the token reassignment, so no nav hooks fire and in-flight refreshAll calls are not cancelled. Note that it is deprecated. The other option is native history.replaceState plus a module $state URL that useSearchParams/currentUrl read. Either way, build the next query from that reactive URL, not from window.location, so writes in the same tick merge. Update the API comment, and the note to other lanes about the progress indicator.
- [major] src/lib/components/issues/use-issue-mutations.svelte.ts: optimistically() (lines 329-336) removes each op as soon as its own perform() settles. React 19 entangles async transitions, so useOptimistic state reverts only when all pending actions finish. In the port, two quick edits A and B each await a refreshAll inside outbox `send`. When B's refresh starts while A's is still loading, _invalidate (client.js:610) discards A's result because invalidation_token changed. A's perform resolves, A's op leaves inFlight, and `optimistic` falls back to `base`, which is still the pre-A server data. Row A visibly snaps back until B's refresh lands. Rapid keyboard triage (status or priority keys across several rows) hits this. → Match React's entanglement: keep every op while any call is in flight, and clear inFlight only when the in-flight count drops to 0. Ideally clear it after one final refreshAll that actually applied (for example, refresh again when the last op settles). Alternatively, keep an op until `base` reflects it.
- [minor] src/lib/components/issues/display-options.svelte.ts: The persisted provider returns DEFAULT_DISPLAY_OPTIONS until its own `$effect(() => hydrated = true)` runs (lines 227-230), so this happens on every mount, not just at hydration. React's useSyncExternalStore uses the server snapshot only while hydrating; on client-side navigation into a project it reads localStorage on the first render. Here every client navigation into a project first renders the default layout (list), mounting that view and running its effects, then switches to the stored layout (for example, board). → Use a module-level flag that turns true once after the app's first hydration (for example, set it in an effect the first time any provider mounts, or in the root layout). Later providers then read the stored value on their first render, as React did.
- [minor] scripts/gen-remote-actions.mjs: Confirms the builder's report, outside this lane. src/app/actions/tickets.ts calls revalidatePath only through the revalidateProject() helper (lines 28-32), so the generator emits `settle(..., false)` for updateIssue, bulkUpdateIssues, archiveIssue and the rest (src/lib/actions/tickets.ts:29-36), and runOutboxCall is also false. Only the outbox path refreshes now, through the workaround in outbox.svelte.ts `send`. Any wave-2 lane that calls @/lib/actions/tickets directly won't refresh after writes, which breaks the PLAN rule "the wrapper already does what Next did". → Coordinator: make the generator follow same-file helpers that call revalidatePath (or mark refresh by file). Then decide whether outbox.svelte.ts keeps its own refresh, so pages don't refresh twice.


### Lane W1c: fix report (wins over the build report)

# W1c fix report

I fixed the three findings in this lane. The fourth, the action generator, is outside the lane and needs the coordinator. Kit-check shows only the 3 "Cannot find module" errors already known for files the Views lane hasn't written yet. I checked everything by reading the code and type-checking only; nothing has been run in a browser.

## Findings

**1. `search-params.svelte.ts`, `setSearchParams` used a shallow `goto` (major): fixed**
- It now writes through Kit's `replaceState(url, page.state)` from `$app/navigation`. That path:
  - fires no `beforeNavigate`, `onNavigate` or `afterNavigate`;
  - never sets `navigating`;
  - doesn't replace the navigation token, so a `refreshAll()` already loading still applies;
  - can't be cancelled by a `beforeNavigate` guard.
- The module now stores the URL it wrote in its own state. `currentUrl()` and `useSearchParams()` return that URL while a write is pending, and afterwards as long as `location.href` still matches it. Otherwise they fall back to `page.shallow?.url ?? page.url`.
- This also fixes a second race in Kit. A `refreshAll()` that was already loading puts `page.shallow` back to its old value when it finishes, so code reading `page.shallow` alone would see stale params.
- The next query is built from that stored URL, not from `window.location`, so two calls in the same tick build on each other. That matches React's synchronous write.
- History writes run one at a time and the latest value wins. A pending write is dropped if the user moves to another page first.
- Downside: Kit marks `replaceState` as deprecated, so dev mode prints a one-time warning.
- I updated the header comment here and the matching comment in `src/lib/components/issues/issue-filters.svelte.ts`.

**2. `use-issue-mutations.svelte.ts`, an op was removed as soon as its own call settled (major): fixed, in two parts**
- **Mutations:** `optimistically()` now counts calls that are still running. Ops are kept until that count reaches 0, then cleared together, the way React entangles async transitions.
- **Outbox (`src/lib/svelte/outbox.svelte.ts`):** writes no longer call `refreshAll()` directly; they go through one queue.
  - Each write waits until a refresh that started after it has actually been applied (`page.data` replaced).
  - Writes made while a refresh is loading share the next one, so our own refreshes never cancel each other.
  - If someone else's `refreshAll()` cancels ours, we run another, at most twice.
- So when the count reaches 0, `base` already includes every op, and a row shouldn't snap back.

**3. `display-options.svelte.ts`, defaults showed on every mount, not only at hydration (minor): fixed**
- New file `src/lib/svelte/hydration.ts` exports `isAppHydrated()` and `markAppHydrated()`. It is a module flag that is never set on the server.
- The root layout `src/routes/+layout.svelte` marks it in an `$effect`, and each provider marks it too.
- A provider starts with `hydrated = isAppHydrated()`. Only the first hydration renders the defaults; a client navigation into a project reads localStorage on the first render, as React did.

**4. `scripts/gen-remote-actions.mjs` refresh flags (minor): skipped, outside this lane**
- The finding is correct and is the coordinator's call.
- If the generator is fixed so `runOutboxCall` refreshes, remove the outbox refresh queue (`refreshAfterWrite`) at the same time. Otherwise every write refreshes twice, and the wrapper's `refreshAll()` would be cancelled by ours.
- Whatever the wrapper does should keep the "wait for a refresh that actually applied" rule, which finding 2 relies on.

## API changes other lanes must know
- **`setSearchParams` is no longer a navigation.** The progress indicator doesn't need to ignore it; it never sets `navigating` or fires navigation hooks.
- **`page.url` never sees these params, and `page.shallow.url` can be stale.** Read them only through `useSearchParams()` or `currentUrl()` from `@/lib/svelte/search-params.svelte`. The signature is unchanged: `(changes) => void`.
- **New helper for browser-only state:** `src/lib/svelte/hydration.ts` (`isAppHydrated`, `markAppHydrated`) is for components that must render the server value during hydration only.
- **No other signature changes.** `perform()` and `flush()` keep their signatures, but they now resolve only after a page refresh that includes the write has been applied.

## Final kit-check
```
"src/lib/components/issues/issue-filters.svelte" 13:26 "Cannot find module '@/lib/components/views/filter-menu.svelte' …"
"src/lib/components/issues/issue-filters.svelte" 14:27 "Cannot find module '@/lib/components/views/filter-chips.svelte' …"
"src/lib/components/issues/issue-filters.svelte" 15:32 "Cannot find module '@/lib/components/views/search-syntax-help.svelte' …"
kit-check: 3 error(s)
```

Files changed:
- /home/oscar/Projects/ticket-system/src/lib/svelte/search-params.svelte.ts
- /home/oscar/Projects/ticket-system/src/lib/svelte/outbox.svelte.ts
- /home/oscar/Projects/ticket-system/src/lib/svelte/hydration.ts (new)
- /home/oscar/Projects/ticket-system/src/lib/components/issues/use-issue-mutations.svelte.ts
- /home/oscar/Projects/ticket-system/src/lib/components/issues/display-options.svelte.ts
- /home/oscar/Projects/ticket-system/src/lib/components/issues/issue-filters.svelte.ts (comment only)
- /home/oscar/Projects/ticket-system/src/routes/+layout.svelte

---

## Coordinator notes after wave 1 (these win)

- The action generator now follows same-file helpers that call `revalidatePath`
  (e.g. `revalidateProject()` in tickets.ts): 154 of 208 wrappers refresh after
  they resolve. Wave-2 code that calls `@/lib/actions/*` must NOT add its own
  `refreshAll()` after those calls.
- Refreshes go through `refreshAfterWrite()` in `src/lib/svelte/refresh.svelte.ts`
  (coalesced, survives concurrent writes — W1c's design, now shared by the
  wrappers and the outbox). If a component must refresh explicitly (React called
  `router.refresh()`), call `refreshAfterWrite()` rather than bare `refreshAll()`.
- Next's tsconfig excludes `src/lib/components`, so `index.ts` barrels and
  `.svelte.ts` files there are Svelte-only.
