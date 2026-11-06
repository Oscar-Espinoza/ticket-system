<!-- Sub-issue progress cell. -->
<script lang="ts">
  import type { IssueRow } from '@/lib/issue-model';
  import SubIssueChip from './sub-issue-chip.svelte';
  import { useSubIssueCount } from './view-context.svelte';

  let { issue }: { issue: IssueRow } = $props();

  const count = useSubIssueCount(() => issue.id);
</script>

{#if count.current}
  <SubIssueChip count={count.current} />
{:else}
  <span class="px-1.5 text-muted-foreground/50">—</span>
{/if}
