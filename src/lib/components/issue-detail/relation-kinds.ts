// Relation kinds shown by SectionRelations / AddRelation.

import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
import CopyIcon from '@lucide/svelte/icons/copy';
import FlagIcon from '@lucide/svelte/icons/flag';
import type { Component } from 'svelte';

import { m } from '@/lib/i18n';
import type { AddableRelationKind, RelationKind } from '@/lib/relations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Icon = Component<any>;

export const KINDS: Record<RelationKind, { group: string; add?: string; icon: Icon; iconClass: string }> = {
  blocked_by: { get group() { return m.shared_rel_blocked_by(); }, get add() { return m.shared_rel_blocked_by_add(); }, icon: FlagIcon, iconClass: 'text-red-500' },
  blocks: { get group() { return m.shared_rel_blocking(); }, get add() { return m.shared_rel_blocking_add(); }, icon: FlagIcon, iconClass: 'text-orange-500' },
  related: { get group() { return m.shared_rel_related(); }, get add() { return m.shared_rel_related_add(); }, icon: ArrowLeftRightIcon, iconClass: 'text-muted-foreground' },
  duplicate_of: { get group() { return m.shared_rel_duplicate_of(); }, get add() { return m.shared_rel_duplicate_of_add(); }, icon: CopyIcon, iconClass: 'text-muted-foreground' },
  duplicated_by: { get group() { return m.shared_rel_duplicated_by(); }, icon: CopyIcon, iconClass: 'text-muted-foreground' },
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
