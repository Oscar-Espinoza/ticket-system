<!-- SidebarSection. -->
<script module lang="ts">
  import type { Snippet } from 'svelte';

  export interface SidebarSectionProps {
    /** Section heading: text, or a snippet (e.g. a link) to make it navigable. */
    title: string | Snippet;
    /** Small control on the right of the heading (e.g. an add button). */
    action?: Snippet;
    children?: Snippet;
  }
</script>

<script lang="ts">
  let { title, action, children }: SidebarSectionProps = $props();
</script>

<section class="mt-4">
  <div class="mb-0.5 flex h-6 items-center justify-between px-2 text-xs font-medium text-muted-foreground">
    {#if typeof title === 'string'}{title}{:else}{@render title()}{/if}
    {@render action?.()}
  </div>
  <div class="flex flex-col gap-px">{@render children?.()}</div>
</section>
