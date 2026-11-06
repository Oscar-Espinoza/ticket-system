<!-- Column header: glyph, name, count, "+". -->
<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';

  import GroupIcon from '@/lib/components/issues/group-icon.svelte';
  import type { IssueViewProps } from '@/lib/components/issues/views';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { IssueGroup } from '@/lib/issue-grouping';
  import { COLUMN_WIDTH } from './board-layout';

  let { group, onCreate }: { group: IssueGroup; onCreate: IssueViewProps['onCreate'] } = $props();

  const canWrite = useProjectPermission('write');
</script>

<header class="flex h-8 shrink-0 items-center gap-2 px-1 text-xs font-medium" style:width="{COLUMN_WIDTH}px">
  <GroupIcon {group} />
  <h2 id={`column-${group.id}`} class="truncate text-foreground">
    {group.label}
  </h2>
  <span class="tabular-nums text-muted-foreground">{group.issues.length}</span>
  {#if canWrite.current}
    <Button
      variant="ghost"
      size="icon-xs"
      class="ml-auto"
      aria-label={`New ${group.label} issue`}
      onclick={() => onCreate(group.patch)}
    >
      <PlusIcon />
    </Button>
  {/if}
</header>
