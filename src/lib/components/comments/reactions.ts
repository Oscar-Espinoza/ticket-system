// Non-component exports of the reactions UI (ReactionBar and
// ReactionPicker are ./reaction-bar.svelte and ./reaction-picker.svelte).

import { m } from '@/lib/i18n';
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
  const people = userIds.map((id) =>
    id === viewerId ? m.editor_comment_you() : (names.get(id) ?? m.editor_comment_former_member()),
  );
  if (people.length === 1) return people[0];
  if (people.length === 2) return m.editor_comment_two_people({ a: people[0], b: people[1] });
  if (people.length === 3) {
    return m.editor_comment_three_people({ list: people.slice(0, 2).join(', '), last: people[2] });
  }
  return m.editor_comment_and_others({ list: people.slice(0, 2).join(', '), count: people.length - 2 });
}
