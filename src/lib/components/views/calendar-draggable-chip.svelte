<!-- A draggable calendar chip.
     Must render inside the calendar's DragDropProvider. -->
<script lang="ts">
  import { createDraggable } from '@dnd-kit/svelte';

  import { chipAttr } from '@/lib/components/issues/issue-dom';
  import { isPendingIssue } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import CalendarIssueChip from './calendar-issue-chip.svelte';

  let { issue, onSelect }: { issue: IssueRow; onSelect?: (issue: IssueRow) => void } = $props();

  const canWrite = useProjectPermission('write');
  const draggable = createDraggable({
    get id() {
      return issue.id;
    },
    type: 'issue',
    get disabled() {
      return !canWrite.current || isPendingIssue(issue);
    },
  });
</script>

<!-- No role: dnd-kit adds its own drag attributes. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
<div
  {@attach draggable.attach}
  tabindex="0"
  {...chipAttr(issue.id)}
  aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
  onclick={onSelect ? () => onSelect(issue) : undefined}
  onkeydown={(event) => {
    if (event.key === 'Enter' && onSelect && event.target === event.currentTarget) {
      event.preventDefault();
      onSelect(issue);
    }
  }}
  class={cn('rounded outline-none focus-visible:ring-2 focus-visible:ring-ring', draggable.isDragSource && 'opacity-40')}
>
  <CalendarIssueChip {issue} selectable={!!onSelect} />
</div>
