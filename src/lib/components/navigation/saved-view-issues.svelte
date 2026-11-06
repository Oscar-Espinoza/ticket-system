<!--
  A saved view's issue list: IssuesView seeded with the view's filters and
  display options. Stored JSON may predate newer option fields, so both are
  normalized over the defaults here (client side — the display defaults live
  in a client module).
-->
<script lang="ts">
  import { normalizeDisplayOptions } from '@/lib/components/issues/display-options.svelte';
  import IssuesView from '@/lib/components/issues/issues-view.svelte';
  import { normalizeIssueFilters } from '@/lib/issue-filtering';
  import type { IssueRow } from '@/lib/issue-model';
  import type { OpenSavedView } from './saved-view-context.svelte';
  import SavedViewProvider from './saved-view-provider.svelte';

  let {
    view,
    issues,
    defaultView,
  }: {
    view: OpenSavedView;
    issues: IssueRow[];
    defaultView?: string;
  } = $props();
</script>

<SavedViewProvider {view}>
  <IssuesView
    {issues}
    {defaultView}
    initialFilters={normalizeIssueFilters(view.filters)}
    initialDisplay={normalizeDisplayOptions(view.display)}
    savedView={{ id: view.id, name: view.name }}
  />
</SavedViewProvider>
