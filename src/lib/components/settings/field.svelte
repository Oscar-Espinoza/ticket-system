<!-- Label + control + hint/error row shared by the settings forms. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { Label } from '@/lib/components/ui/label';

  let {
    id,
    label,
    hint,
    error,
    children,
  }: {
    id: string;
    label: string;
    /** Plain text, or a snippet for rich content. */
    hint?: string | Snippet;
    error?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="flex flex-col gap-1.5">
  <Label for={id}>{label}</Label>
  {@render children?.()}
  {#if error}
    <p id="{id}-error" role="alert" class="text-xs text-destructive">
      {error}
    </p>
  {:else if hint}
    <p class="text-xs text-muted-foreground">
      {#if typeof hint === 'string'}{hint}{:else}{@render hint()}{/if}
    </p>
  {/if}
</div>
