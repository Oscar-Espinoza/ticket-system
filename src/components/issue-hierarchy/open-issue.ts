'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { setSearchParams } from '@/components/issues/issue-filters';
import { issuePath } from '@/lib/issue-links';

/**
 * Opens another issue from inside an issue detail: in the list's side pane
 * (`?issue=KEY` is set) it swaps the selection in place; on the permalink page
 * it navigates to the other issue's page.
 */
export function useOpenIssue() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inPane = searchParams.has('issue');

  return (issue: { projectId: string; key: string }) => {
    if (inPane) setSearchParams({ issue: issue.key });
    else router.push(issuePath(issue.projectId, issue.key));
  };
}
