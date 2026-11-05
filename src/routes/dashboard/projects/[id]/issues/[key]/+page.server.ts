// Issue permalink — the stable, shareable URL for one issue (notifications,
// Slack, emails, search and "Copy link" all point here). The project layout
// already 404s non-members; getProjectData is the same cached call.
// (Port of src/app/dashboard/projects/[id]/issues/[key]/page.tsx.)

import { error, redirect } from '@sveltejs/kit';

import { issuePath } from '@/lib/issue-links';
import { getProjectData } from '@/lib/project-data';
import { getIssueByKey, getProjectIssues } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

const KEY_PATTERN = /^([A-Za-z0-9]+)-(\d{1,9})$/;

/** "app-12" → 12. The prefix isn't checked: renamed project keys keep resolving. */
function parseKeyNumber(raw: string): number | null {
  let key: string;
  try {
    key = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  const match = KEY_PATTERN.exec(key);
  return match ? Number(match[2]) : null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id, key } = params;
  const userId = locals.user?.id;
  const number = parseKeyNumber(key);

  let issue = null;
  if (userId && number !== null) {
    const data = await getProjectData(id, userId);
    // Passing the viewer enables the moved-issue alias fallback (ticket_key_alias).
    if (data) issue = await getIssueByKey(id, number, userId);
  }
  // Next set the title "Issue not found" and rendered the project not-found page.
  if (!issue || !userId) error(404, 'Issue not found');

  // Lowercase keys, keys from before a project-key rename and issues moved to
  // another project all redirect to the canonical URL.
  if (issue.projectId !== id || key !== issue.key) {
    redirect(303, issuePath(issue.projectId, issue.key));
  }

  // The project's active issues feed the sub-issue / relation sections.
  const projectIssues = await getProjectIssues(id, userId);
  return { issue, projectIssues };
};
