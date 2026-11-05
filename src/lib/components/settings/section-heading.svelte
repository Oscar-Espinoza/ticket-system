<!-- Title + description block that opens a settings section. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    description,
    icon,
  }: {
    title: string;
    /** Plain text, or a snippet for rich content (React: ReactNode). */
    description: string | Snippet;
    /** Leading glyph next to the title (developer settings). */
    icon?: Snippet;
  } = $props();
</script>

<div>
  {#if icon}
    <h2 class="flex items-center gap-2 text-base font-medium">
      {@render icon()}
      {title}
    </h2>
  {:else}
    <h2 class="text-base font-medium">{title}</h2>
  {/if}
  <p class="mt-1 text-sm text-muted-foreground">
    {#if typeof description === 'string'}{description}{:else}{@render description()}{/if}
  </p>
</div>
