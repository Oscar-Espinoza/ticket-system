<!-- The doc's emoji, or a quiet page glyph (port of document-icon.tsx). -->
<script lang="ts">
  import FileText from '@lucide/svelte/icons/file-text';

  import { cn } from '@/lib/utils';

  let { icon, class: className }: { icon: string | null | undefined; class?: string } = $props();
</script>

{#if icon}
  <span aria-hidden="true" class={cn('flex size-4 shrink-0 items-center justify-center text-sm leading-none', className)}>
    {icon}
  </span>
{:else}
  <FileText aria-hidden="true" class={cn('size-4 shrink-0 text-muted-foreground', className)} />
{/if}
