<!-- Warning / error callout used by the GitHub and developer-integration settings. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import { cn } from '@/lib/utils';

  let { tone, children }: { tone: 'warning' | 'error'; children?: Snippet } = $props();
</script>

<p
  role={tone === 'error' ? 'alert' : undefined}
  class={cn(
    'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
    tone === 'warning'
      ? 'border-amber-500/30 bg-amber-500/10 text-foreground'
      : 'border-destructive/30 bg-destructive/10 text-destructive',
  )}
>
  <TriangleAlertIcon
    aria-hidden="true"
    class={cn('mt-0.5 size-4 shrink-0', tone === 'warning' && 'text-amber-500')}
  />
  <span>{@render children?.()}</span>
</p>
