// Domain glyphs and primitives (status, priority, labels, avatars, states).
// EmptyState's `icon` / `action` are snippets ({#snippet icon()}<InboxIcon />{/snippet});
// LabelChip children → children snippet.

export { default as StatusIcon } from './status-icon.svelte';
export { default as StateIcon } from './state-icon.svelte';
export type { StatusIconProps } from './status-icon.svelte';
export type { StateIconProps } from './state-icon.svelte';

export { default as PriorityIcon } from './priority-icon.svelte';
export type { PriorityIconProps, Priority } from './priority-icon.svelte';

export { default as LabelChip } from './label-chip.svelte';
export type { LabelChipProps, LabelChipColor } from './label-chip.svelte';

export { default as Avatar } from './avatar.svelte';
export type { AvatarProps } from './avatar.svelte';

export { default as Skeleton } from './skeleton.svelte';
export type { SkeletonProps } from './skeleton.svelte';

export { default as EmptyState } from './empty-state.svelte';
export type { EmptyStateProps } from './empty-state.svelte';
