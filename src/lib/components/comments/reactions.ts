// Non-component exports of the reactions UI (ReactionBar and
// ReactionPicker are ./reaction-bar.svelte and ./reaction-picker.svelte).

import { COMMENT_REACTIONS, type CommentReaction, type ReactionGroup } from '@/lib/timeline';

/** Toggle `userId`'s `emoji` on a comment's groups, keeping COMMENT_REACTIONS order. */
export function toggleReactionGroups(
  groups: ReactionGroup[],
  emoji: CommentReaction,
  userId: string,
): ReactionGroup[] {
  const current = groups.find((g) => g.emoji === emoji);
  const userIds = current?.userIds.includes(userId)
    ? current.userIds.filter((id) => id !== userId)
    : [...(current?.userIds ?? []), userId];
  const others = groups.filter((g) => g.emoji !== emoji);
  const next = userIds.length ? [...others, { emoji, userIds }] : others;
  return next.sort((a, b) => COMMENT_REACTIONS.indexOf(a.emoji) - COMMENT_REACTIONS.indexOf(b.emoji));
}

export function whoReacted(userIds: string[], viewerId: string, names: Map<string, string>) {
  const people = userIds.map((id) => (id === viewerId ? 'You' : (names.get(id) ?? 'Former member')));
  if (people.length <= 3) {
    return people.length === 1 ? people[0] : `${people.slice(0, -1).join(', ')} and ${people.at(-1)}`;
  }
  return `${people.slice(0, 2).join(', ')} and ${people.length - 2} others`;
}
