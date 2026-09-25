'use client';

// Client half of the issue permalink page. The issue stays in the mutation
// scope even when archived / trashed, so archiving from the `…` menu leaves the
// page in place with IssueDetail's banner + Restore instead of blanking it.

import { IssueDetail } from '@/components/issue-detail/issue-detail';
import { IssueShortcuts } from '@/components/issues/slots/issue-shortcuts';
import { isActiveIssue, useIssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';

export function IssuePermalink({
  issue: serverIssue,
  projectIssues,
}: {
  issue: IssueRow;
  /** The project's active issues (sub-issue, parent and relation pickers use them). */
  projectIssues: IssueRow[];
}) {
  const serverIssues = projectIssues.some((i) => i.id === serverIssue.id)
    ? projectIssues
    : [serverIssue, ...projectIssues];
  const mutations = useIssueMutations(serverIssues, {
    include: (i) => i.id === serverIssue.id || isActiveIssue(i),
  });
  const issue = mutations.issues.find((i) => i.id === serverIssue.id) ?? serverIssue;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <IssueDetail issue={issue} mutations={mutations} variant="page" />
      <IssueShortcuts issues={mutations.issues} mutations={mutations} selectedIssue={issue} />
    </div>
  );
}
