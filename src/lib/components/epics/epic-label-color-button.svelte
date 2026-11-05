<!-- Color dot button + swatch popover (epic-labels.tsx ColorButton). -->
<script lang="ts">
  import { Button } from '@/lib/components/ui/button';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import ColorSwatches from './color-swatches.svelte';

  let { value, onChange }: { value: string; onChange: (color: string) => void } = $props();

  let open = $state(false);
</script>

<Popover bind:open>
  <PopoverTrigger>
    {#snippet child({ props })}
      <Button {...props} type="button" variant="ghost" size="icon-sm" aria-label="Label color">
        <span class="size-3 rounded-full" style="background-color: {value}"></span>
      </Button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="start" class="w-auto p-2">
    <ColorSwatches
      {value}
      onChange={(color) => {
        open = false;
        onChange(color);
      }}
      class="max-w-40"
    />
  </PopoverContent>
</Popover>
