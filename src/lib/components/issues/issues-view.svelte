<!--
  The issues screen: toolbar (layout switcher, saved-view badge, filters,
  display menu, "New issue"), the current layout, the detail pane, selection,
  context menu, bulk bar, shortcuts and the new-issue dialog.
  Port of src/components/issues/issues-view.tsx (same props; `emptyState` is a
  snippet). Another saved view on the same route starts from its own
  filters/display (keyed by savedView.id, as React's `key`).
-->
<script module lang="ts">
  import type { Snippet } from 'svelte';

  import type { IssueFilters as Filters } from '@/lib/issue-filtering';
  import type { IssuePatch, IssueRow } from '@/lib/issue-model';
  import type { DisplayOptions } from './display-options.svelte';

  type JsonObject = Record<string, unknown>;

  export interface IssuesViewProps {
    /** Server issues (e.g. the project's active issues, a cycle's, an epic's). */
    issues: IssueRow[];
    /** Last layout chosen this browser session (cookie); a `view` URL param wins. */
    defaultView?: string;
    /** Merged into every new issue created here (cycle / epic pages). */
    createDefaults?: IssuePatch;
    /** Saved view filters (JSON) — used when the URL carries none. */
    initialFilters?: Partial<Filters> | JsonObject;
    /** Saved view display options (JSON); not persisted to localStorage. */
    initialDisplay?: Partial<DisplayOptions> | JsonObject;
    /** The saved view being shown (name in the toolbar, dirty tracking). */
    savedView?: { id: string; name: string };
    /** Replaces the "No issues yet" state when there are no issues at all. */
    emptyState?: Snippet;
  }
</script>

<script lang="ts">
  import IssuesViewRoot from './issues-view-root.svelte';

  let props: IssuesViewProps = $props();
</script>

{#key props.savedView?.id ?? 'issues'}
  <IssuesViewRoot {...props} />
{/key}
