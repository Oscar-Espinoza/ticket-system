<!-- Labelled form row of the widget editor. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { Label } from '@/lib/components/ui/label';

  let { label, htmlFor, children }: { label: string; htmlFor?: string; children?: Snippet } = $props();
</script>

<div class="flex flex-col gap-1.5">
  <Label for={htmlFor} class="text-xs text-muted-foreground">
    {label}
  </Label>
  {@render children?.()}
</div>
