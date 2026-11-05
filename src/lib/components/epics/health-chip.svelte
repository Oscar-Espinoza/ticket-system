<!-- "● On track"; renders a muted "No updates" when health is null and `showEmpty`. -->
<script lang="ts">
  import { cn } from '@/lib/utils';
  import { HEALTH_COLOR, HEALTH_LABEL, type Health } from '@/lib/components/epics/epic-model';
  import HealthDot from './health-dot.svelte';

  let {
    health,
    showEmpty = false,
    class: className,
  }: {
    health: Health | null;
    showEmpty?: boolean;
    class?: string;
  } = $props();
</script>

{#if !health}
  {#if showEmpty}
    <span class={cn('text-xs text-muted-foreground', className)}>No updates</span>
  {/if}
{:else}
  <span
    class={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', className)}
    style="color: {HEALTH_COLOR[health]}"
  >
    <HealthDot {health} />
    {HEALTH_LABEL[health]}
  </span>
{/if}
