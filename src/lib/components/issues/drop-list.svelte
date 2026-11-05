<!-- A group's rows; also a drop target so empty groups accept issues. (DropList in issue-list.tsx) -->
<script lang="ts">
  import { createDroppable } from '@dnd-kit/svelte';
  import type { Snippet } from 'svelte';

  import { cn } from '@/lib/utils';

  let { id, class: className, children }: { id: string; class?: string; children: Snippet } = $props();

  const droppable = createDroppable({
    get id() {
      return id;
    },
    type: 'group',
    accept: 'issue',
    // CollisionPriority.Low: rows inside win, the list catches the rest.
    collisionPriority: 1,
  });
</script>

<ul {@attach droppable.attach} class={cn(className, droppable.isDropTarget && 'rounded-md bg-accent/30')}>
  {@render children()}
</ul>
