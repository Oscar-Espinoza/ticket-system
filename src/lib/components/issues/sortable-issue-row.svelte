<!--
  A draggable list row slot (SortableIssueRow in issue-list.tsx). The sortable
  element is the row itself: `children` receives the attachment to put on it.
  Must render inside the list's DragDropProvider.
-->
<script lang="ts">
  import { createSortable } from '@dnd-kit/svelte/sortable';
  import type { Snippet } from 'svelte';
  import type { Attachment } from 'svelte/attachments';

  import { cn } from '@/lib/utils';

  let {
    id,
    index,
    group,
    disabled,
    children,
  }: {
    id: string;
    index: number;
    group: string;
    disabled: boolean;
    children: Snippet<[Attachment<HTMLElement>]>;
  } = $props();

  const sortable = createSortable({
    get id() {
      return id;
    },
    get index() {
      return index;
    },
    get group() {
      return group;
    },
    type: 'issue',
    accept: 'issue',
    get disabled() {
      return disabled;
    },
  });
</script>

<li class={cn(sortable.isDragSource && 'opacity-40')}>
  {@render children(sortable.attach)}
</li>
