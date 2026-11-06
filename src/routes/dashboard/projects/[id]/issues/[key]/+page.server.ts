// Issue permalink — the stable, shareable URL for one issue (notifications,
// Slack, emails, search and "Copy link" all point here). The project layout
// 404s non-members; `await parent()` waits for that check.

import { error, redirect } from '@sveltejs/kit';

import { issuePath } from '@/lib/issue-links';
import { requireUser } from '@/lib/session';
import { getIssueByKey, getProjectIssues, parseIssueKey } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

/** "app-12" → 12. The prefix isn't checked: renamed project keys keep resolving. */
function parseKeyNumber(raw: string): number | null {
  try {
    return parseIssueKey(decodeURIComponent(raw))?.number ?? null;
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async ({ params, parent }) => {
  const { id, key } = params;
  const { id: userId } = await requireUser();
  await parent();
  const number = parseKeyNumber(key);

  // Passing the viewer enables the moved-issue alias fallback (ticket_key_alias).
  const issue = number === null ? null : await getIssueByKey(id, number, userId);
  if (!issue) error(404, 'Issue not found');

  // Lowercase keys, keys from before a project-key rename and issues moved to
  // another project all redirect to the canonical URL.
  if (issue.projectId !== id || key !== issue.key) {
    redirect(303, issuePath(issue.projectId, issue.key));
  }

  // The project's active issues feed the sub-issue / relation sections.
  const projectIssues = await getProjectIssues(id, userId);
  return { issue, projectIssues };
};
