// Relation kinds shown by SectionRelations / AddRelation.

import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
import CopyIcon from '@lucide/svelte/icons/copy';
import FlagIcon from '@lucide/svelte/icons/flag';
import type { Component } from 'svelte';

import type { AddableRelationKind, RelationKind } from '@/lib/relations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Icon = Component<any>;

export const KINDS: Record<RelationKind, { group: string; add?: string; icon: Icon; iconClass: string }> = {
  blocked_by: { group: 'Blocked by', add: 'Blocked by…', icon: FlagIcon, iconClass: 'text-red-500' },
  blocks: { group: 'Blocking', add: 'Blocking…', icon: FlagIcon, iconClass: 'text-orange-500' },
  related: { group: 'Related', add: 'Related to…', icon: ArrowLeftRightIcon, iconClass: 'text-muted-foreground' },
  duplicate_of: { group: 'Duplicate of', add: 'Mark as duplicate of…', icon: CopyIcon, iconClass: 'text-muted-foreground' },
  duplicated_by: { group: 'Duplicated by', icon: CopyIcon, iconClass: 'text-muted-foreground' },
};
export const GROUP_ORDER: RelationKind[] = ['blocked_by', 'blocks', 'related', 'duplicate_of', 'duplicated_by'];
export const ADD_ORDER: AddableRelationKind[] = ['blocked_by', 'blocks', 'related', 'duplicate_of'];

/** Kinds that share a stored row type — an issue already linked that way is excluded. */
export const SAME_STORED: Record<AddableRelationKind, RelationKind[]> = {
  blocks: ['blocks', 'blocked_by'],
  blocked_by: ['blocks', 'blocked_by'],
  related: ['related'],
  duplicate_of: ['duplicate_of', 'duplicated_by'],
};
