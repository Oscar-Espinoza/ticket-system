// C4 barrel — the single export surface for the M4 visual primitives
// (docs/mimo-refactor/M4-visual-system.md, scope item 1).
//
// Contract note: after M4 ships this file is ADDITIVE-ONLY (M4 "Allowed
// future touches" — later milestones may add exports, never rename or
// remove existing ones; the component APIs themselves are frozen).

export { StatusIcon } from './status-icon';
export type { StatusIconProps, TicketStatus } from './status-icon';

export { PriorityIcon } from './priority-icon';
export type { PriorityIconProps, Priority } from './priority-icon';

export { LabelChip } from './label-chip';
export type { LabelChipProps, LabelChipColor } from './label-chip';

export { Avatar } from './avatar';
export type { AvatarProps } from './avatar';

export { Skeleton } from './skeleton';
export type { SkeletonProps } from './skeleton';

export { EmptyState } from './empty-state';
export type { EmptyStateProps } from './empty-state';
