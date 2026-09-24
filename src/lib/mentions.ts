// Canonical @mention token shared by the editor, comments, notifications and
// integrations. Stored in markdown as `@[Display Name](user:USER_ID)` so the
// raw text stays readable and the id survives display-name changes.

export const MENTION_PATTERN = /@\[([^\]\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

export function formatMention(user: { id: string; name: string }): string {
  // Brackets would end the label early; the name is display-only anyway.
  const name = user.name.replace(/[[\]\n]/g, '').trim() || 'user';
  return `@[${name}](user:${user.id})`;
}

/** Unique mentioned user ids, in first-appearance order. */
export function extractMentionIds(body: string | null | undefined): string[] {
  if (!body) return [];
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) ids.add(match[2]);
  return [...ids];
}

/** Ids mentioned in `next` that weren't already mentioned in `previous`. */
export function newMentionIds(
  previous: string | null | undefined,
  next: string | null | undefined,
): string[] {
  const before = new Set(extractMentionIds(previous));
  return extractMentionIds(next).filter((id) => !before.has(id));
}

/** Plain-text form (`@Display Name`) for emails, Slack and previews. */
export function stripMentions(body: string): string {
  return body.replace(MENTION_PATTERN, (_, name: string) => `@${name}`);
}
