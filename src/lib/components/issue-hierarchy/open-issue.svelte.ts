// Port of src/components/issue-hierarchy/open-issue.ts.

import { goto } from '$app/navigation';

import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
import { issuePath } from '@/lib/issue-links';

/**
 * Opens another issue from inside an issue detail: in the list's side pane
 * (`?issue=KEY` is set) it swaps the selection in place; on the permalink page
 * it navigates to the other issue's page. Call during component init; the
 * returned function reads the URL when it runs.
 */
export function useOpenIssue() {
  const searchParams = useSearchParams();

  return (issue: { projectId: string; key: string }) => {
    if (searchParams.has('issue')) setSearchParams({ issue: issue.key });
    else void goto(issuePath(issue.projectId, issue.key));
  };
}
