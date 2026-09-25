'use client';

// A saved view's issue list: IssuesView seeded with the view's filters and
// display options. Stored JSON may predate newer option fields, so both are
// normalized over the defaults here (client side — the display defaults live
// in a client module).

import { normalizeDisplayOptions } from '@/components/issues/display-options';
import { IssuesView } from '@/components/issues/issues-view';
import { normalizeIssueFilters } from '@/lib/issue-filtering';
import type { IssueRow } from '@/lib/issue-model';
import { SavedViewProvider, type OpenSavedView } from './saved-view-context';

export function SavedViewIssues({
  view,
  issues,
  defaultView,
}: {
  view: OpenSavedView;
  issues: IssueRow[];
  defaultView?: string;
}) {
  return (
    <SavedViewProvider view={view}>
      <IssuesView
        issues={issues}
        defaultView={defaultView}
        initialFilters={normalizeIssueFilters(view.filters)}
        initialDisplay={normalizeDisplayOptions(view.display)}
        savedView={{ id: view.id, name: view.name }}
      />
    </SavedViewProvider>
  );
}
