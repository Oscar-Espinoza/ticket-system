<!-- Layout toggle (List / Board / …). -->
<script lang="ts">
  import { cn } from '@/lib/utils';
  import type { IssueViewDefinition } from './views';

  let {
    views,
    current,
    onChange,
  }: {
    views: IssueViewDefinition[];
    current: string;
    onChange: (id: string) => void;
  } = $props();
</script>

<div role="group" aria-label="View" class="inline-flex h-7 items-center rounded-md border border-border p-0.5">
  {#each views as view (view.id)}
    {@const selected = view.id === current}
    <button
      type="button"
      aria-pressed={selected}
      onclick={() => onChange(view.id)}
      class={cn(
        'inline-flex h-full items-center gap-1.5 rounded px-2 text-xs font-medium outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <view.icon class="size-3.5" aria-hidden="true" />
      {view.label}
    </button>
  {/each}
</div>
