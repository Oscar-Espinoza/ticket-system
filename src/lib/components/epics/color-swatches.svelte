<script lang="ts">
  import CheckIcon from '@lucide/svelte/icons/check';

  import { cn } from '@/lib/utils';
  import { EPIC_COLORS } from '@/components/epics/epic-model';

  let {
    value,
    onChange,
    class: className,
  }: {
    value: string;
    onChange: (color: string) => void;
    class?: string;
  } = $props();
</script>

<div role="radiogroup" aria-label="Color" class={cn('flex flex-wrap gap-1.5', className)}>
  {#each EPIC_COLORS as color (color)}
    <button
      type="button"
      role="radio"
      aria-checked={color === value}
      aria-label={color}
      onclick={() => onChange(color)}
      class="flex size-6 items-center justify-center rounded-md outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      style="background-color: {color}"
    >
      {#if color === value}
        <CheckIcon class="size-3.5 text-white" />
      {/if}
    </button>
  {/each}
</div>
