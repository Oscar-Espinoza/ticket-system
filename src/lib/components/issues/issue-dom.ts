// The DOM contract for "an issue on screen": which attributes mark an element
// as an issue, which selector set each consumer matches, and how to read the id
// back. Row-shaped elements (list row, table `tr`, timeline row) carry
// `data-issue-row`, board cards `data-board-card`, calendar chips
// `data-issue-chip`. The markup that emits these attributes writes the literal
// names; everything that queries them goes through here.

export const ISSUE_ROW_ATTR = 'data-issue-row';

/** List rows, table rows and timeline rows. */
export const ISSUE_ROW = '[data-issue-row]';
/** A selectable / actionable issue element (rows and board cards). */
export const ISSUE_ITEM = '[data-issue-row], [data-board-card]';
/** The element wrapping a view's rows — ranges and "select all" stay inside it. */
export const VIEW_SCOPE = '[data-issue-view]';

/** Id of an element matched by `ISSUE_ITEM`. */
export const issueIdOf = (el: HTMLElement) => el.dataset.issueRow ?? el.dataset.boardCard ?? null;

/** The issue row / board card that has keyboard focus, if any. */
export function focusedIssueId(): string | null {
  const el = document.activeElement?.closest<HTMLElement>(ISSUE_ITEM);
  return el ? issueIdOf(el) : null;
}

/** The id of the focused list / table / timeline row (not board cards), if any. */
export function focusedIssueRowId(): string | null {
  return document.activeElement?.closest<HTMLElement>(ISSUE_ROW)?.dataset.issueRow ?? null;
}

/** Id of the row-shaped issue element containing `target`, if any. */
export function issueRowIdAt(target: Element | null): string | null {
  return target?.closest<HTMLElement>(ISSUE_ROW)?.dataset.issueRow ?? null;
}

/** Focus the row for `id`. `tag` narrows the match (`'tr'` for table rows). */
export function focusIssueRow(id: string, tag = '') {
  document.querySelector<HTMLElement>(`${tag}[data-issue-row="${id}"]`)?.focus();
}

/** Focus whichever element shows `id` in the current view: row, board card or calendar chip. */
export function focusIssueElement(id: string | null | undefined) {
  document
    .querySelector<HTMLElement>(`[data-issue-row="${id}"], [data-board-card="${id}"], [data-issue-chip="${id}"]`)
    ?.focus();
}
