// Issue references in branch names, PR titles/bodies and commit messages
// ("magic words"). Pure; only the project's own key counts, so another team's
// `ABC-1` or a stray `part-2` never matches.
//
//   Fixes APP-12            → closing  (moves the issue on merge / default-branch push)
//   closes app-3, APP-4     → closing, both
//   Ref APP-5 / part of …   → non-closing (link only)
//   APP-7                   → plain mention

export interface IssueReference {
  number: number;
  closing: boolean;
  nonClosing: boolean;
}

const CLOSING = String.raw`close[sd]?|fix(?:e[sd])?|resolve[sd]?`;
const NON_CLOSING = String.raw`refs?|references?|part\s+of|related\s+to|contributes\s+to|towards`;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keyToken(ticketKey: string) {
  return String.raw`${escapeRegExp(ticketKey)}-\d+`;
}

/** Every `<KEY>-<n>` in `text`, case-insensitive (branch names are lowercase). */
export function findIssueNumbers(text: string | null | undefined, ticketKey: string): number[] {
  if (!text) return [];
  const re = new RegExp(String.raw`(?<![A-Za-z0-9])${escapeRegExp(ticketKey)}-(\d+)(?![A-Za-z0-9])`, 'gi');
  return [...new Set([...text.matchAll(re)].map((m) => Number(m[1])))];
}

function numbersAfter(words: string, text: string, ticketKey: string): Set<number> {
  const key = keyToken(ticketKey);
  const list = String.raw`${key}(?:\s*(?:,|&|and)\s*${key})*`;
  const re = new RegExp(String.raw`(?<![A-Za-z0-9])(?:${words})\s*:?\s+(${list})`, 'gi');
  const found = new Set<number>();
  for (const match of text.matchAll(re)) {
    for (const n of findIssueNumbers(match[1], ticketKey)) found.add(n);
  }
  return found;
}

export function findReferences(text: string | null | undefined, ticketKey: string): IssueReference[] {
  if (!text) return [];
  const closing = numbersAfter(CLOSING, text, ticketKey);
  const nonClosing = numbersAfter(NON_CLOSING, text, ticketKey);
  return findIssueNumbers(text, ticketKey).map((number) => ({
    number,
    closing: closing.has(number),
    // A closing word anywhere wins over a "ref" elsewhere in the same text.
    nonClosing: nonClosing.has(number) && !closing.has(number),
  }));
}

export interface PullRequestText {
  branch: string | null;
  title: string;
  body: string | null;
}

/**
 * Split a PR's references into `auto` (the issue follows the PR's state:
 * branch keys, title keys unless marked "ref", closing words anywhere) and
 * `linkOnly` (other body mentions and non-closing references).
 */
export function classifyPullRequest(pr: PullRequestText, ticketKey: string) {
  const auto = new Set<number>(findIssueNumbers(pr.branch, ticketKey));
  const linkOnly = new Set<number>();
  for (const ref of findReferences(pr.title, ticketKey)) {
    (ref.nonClosing ? linkOnly : auto).add(ref.number);
  }
  for (const ref of findReferences(pr.body, ticketKey)) {
    (ref.closing ? auto : linkOnly).add(ref.number);
  }
  for (const n of auto) linkOnly.delete(n);
  return { auto, linkOnly };
}

/** Issue numbers a commit message closes (closing words only). */
export function closingNumbers(message: string, ticketKey: string): number[] {
  return findReferences(message, ticketKey)
    .filter((ref) => ref.closing)
    .map((ref) => ref.number);
}
