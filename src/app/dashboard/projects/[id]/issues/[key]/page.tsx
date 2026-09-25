// Issue permalink — the stable, shareable URL for one issue (notifications,
// Slack, emails, search and "Copy link" all point here). The project layout
// already 404s non-members; getProjectData is the same cached call.

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { IssuePermalink } from '@/components/navigation/issue-permalink';
import { issuePath } from '@/lib/issue-links';
import { getProjectData } from '@/lib/project-data';
import { getSession } from '@/lib/session';
import { getIssueByKey, getProjectIssues } from '@/lib/tickets';

type Params = Promise<{ id: string; key: string }>;

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

// Memoized per request: generateMetadata and the page both call it.
const load = cache(async (id: string, rawKey: string) => {
  const session = await getSession();
  if (!session?.user) return null;
  const number = parseKeyNumber(rawKey);
  if (number === null) return null;
  const data = await getProjectData(id, session.user.id);
  if (!data) return null;
  const issue = await getIssueByKey(id, number);
  return issue ? { issue, userId: session.user.id } : null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, key } = await params;
  const found = await load(id, key);
  return { title: found ? `${found.issue.key} ${found.issue.title}` : 'Issue not found' };
}

export default async function IssuePage({ params }: { params: Params }) {
  const { id, key } = await params;
  const found = await load(id, key);
  if (!found) notFound();

  // Lowercase keys and keys from before a project-key rename resolve by
  // number; send them to the canonical URL.
  if (key !== found.issue.key) redirect(issuePath(id, found.issue.key));

  // The project's active issues feed the sub-issue / relation sections.
  const projectIssues = await getProjectIssues(id, found.userId);
  return <IssuePermalink issue={found.issue} projectIssues={projectIssues} />;
}
