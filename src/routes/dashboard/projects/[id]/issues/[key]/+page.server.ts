// Issue permalink — the stable, shareable URL for one issue (notifications,
// Slack, emails, search and "Copy link" all point here). The project layout
// also 404s non-members; this page checks membership itself (getProjectData is
// memoized per request) so its own "Issue not found" stays the 404 message.

import { error, redirect } from '@sveltejs/kit';

import { issuePath } from '@/lib/issue-links';
import { getProjectData } from '@/lib/project-data';
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

export const load: PageServerLoad = async ({ params }) => {
  const { id, key } = params;
  const { id: userId } = await requireUser();
  const number = parseKeyNumber(key);

  // Passing the viewer enables the moved-issue alias fallback (ticket_key_alias).
  const member = number !== null && (await getProjectData(id, userId)) !== null;
  const issue = member ? await getIssueByKey(id, number, userId) : null;
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
