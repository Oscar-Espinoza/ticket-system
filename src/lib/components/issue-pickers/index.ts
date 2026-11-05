// Reusable, keyboard-first property pickers (port of src/components/issue-pickers/index.ts,
// same export names). Each has a popover version and a bare `…Options` list for dialogs,
// the palette and bulk edit.
//
// Svelte translation for callers:
// - The trigger (React `children` via asChild) is a `children` snippet that receives the
//   trigger props; spread them on your element:
//     <StatePicker value={id} onChange={(stateId) => …}>
//       {#snippet children({ props })}<Button {...props} variant="ghost">…</Button>{/snippet}
//     </StatePicker>
// - `open` + `onOpenChange` as in React, or `bind:open`; uncontrolled when omitted.
// - PickerPopover's `content={(close) => …}` → `{#snippet content(close)}…{/snippet}`.
// - keywordFilter / digitShortcut / LABEL_COLORS are plain functions/values (picker-utils.ts);
//   digitShortcut returns a DOM `(event: KeyboardEvent) => void` for `onkeydown`.

export { default as PickerPopover } from './picker-popover.svelte';
export type { PickerPopoverProps, PickerTrigger } from './picker-popover.svelte';
export { keywordFilter, digitShortcut, LABEL_COLORS } from './picker-utils';
export { default as StatePicker } from './state-picker.svelte';
export { default as StateOptions } from './state-options.svelte';
export type { StateOptionsProps } from './state-options.svelte';
export { default as PriorityPicker } from './priority-picker.svelte';
export { default as PriorityOptions } from './priority-options.svelte';
export type { PriorityOptionsProps } from './priority-options.svelte';
export { default as AssigneePicker } from './assignee-picker.svelte';
export { default as AssigneeOptions } from './assignee-options.svelte';
export type { AssigneeOptionsProps } from './assignee-options.svelte';
export { default as LabelPicker } from './label-picker.svelte';
export { default as LabelOptions } from './label-options.svelte';
export type { LabelOptionsProps } from './label-options.svelte';
export { default as EstimatePicker } from './estimate-picker.svelte';
export { default as EstimateOptions } from './estimate-options.svelte';
export type { EstimateOptionsProps } from './estimate-options.svelte';
export { default as DueDatePicker } from './due-date-picker.svelte';
export { default as DueDateOptions } from './due-date-options.svelte';
export type { DueDateOptionsProps } from './due-date-options.svelte';
