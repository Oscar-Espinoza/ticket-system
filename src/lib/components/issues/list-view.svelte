<!-- The "List" layout: hides empty groups unless asked, applies sub-grouping. (ListView in views.tsx) -->
<script lang="ts">
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { subGroupIssues } from '@/lib/issue-grouping';
  import { useDisplayOptions } from './display-options.svelte';
  import IssueList from './issue-list.svelte';
  import type { IssueViewProps } from './views';

  let { groups, mutations, selectedId, onSelect, onCreate }: IssueViewProps = $props();

  const display = useDisplayOptions();
  const data = useProjectData();
  const visible = $derived(
    display.current.showEmptyGroups ? groups : groups.filter((g) => g.issues.length > 0),
  );
  const listed = $derived(subGroupIssues(visible, display.current.subGroupBy, data));
</script>

<IssueList groups={listed} {mutations} {selectedId} {onSelect} {onCreate} />
