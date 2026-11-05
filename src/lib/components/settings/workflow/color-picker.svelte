<!--
  Color swatch button + popover with preset swatches and a hex field. Shared by
  the workflow-state and label settings rows.
-->
<script module lang="ts">
  export const PRESET_COLORS = [
    '#5e6ad2',
    '#26b5ce',
    '#0f9d9f',
    '#4cb782',
    '#f2c94c',
    '#e5a100',
    '#f2994a',
    '#fc7840',
    '#eb5757',
    '#db5e9a',
    '#bb87fc',
    '#3b82f6',
    '#747981',
    '#9da1a8',
  ] as const;

  const HEX_RE = /^#[0-9a-f]{6}$/i;
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import CheckIcon from '@lucide/svelte/icons/check';

  import { Input } from '@/lib/components/ui/input';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { cn } from '@/lib/utils';

  let {
    value,
    onChange,
    label = 'Color',
    disabled,
  }: {
    value: string;
    onChange: (color: string) => void;
    /** Accessible name of the trigger. */
    label?: string;
    disabled?: boolean;
  } = $props();

  let open = $state(false);
  let draft = $state(untrack(() => value));
</script>

<Popover
  {open}
  onOpenChange={(next) => {
    open = next;
    if (next) draft = value;
  }}
>
  <PopoverTrigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        {disabled}
        aria-label="{label}: {value}"
        class="flex size-7 shrink-0 items-center justify-center rounded-md border outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <span class="size-3.5 rounded-full" style:background-color={value}></span>
      </button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="start" class="w-56 p-2">
    <div class="grid grid-cols-7 gap-1" role="listbox" aria-label="Preset colors">
      {#each PRESET_COLORS as color (color)}
        {@const selected = color === value.toLowerCase()}
        <button
          type="button"
          role="option"
          aria-selected={selected}
          aria-label={color}
          onclick={() => {
            onChange(color);
            open = false;
          }}
          class="flex size-6 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            class="flex size-4 items-center justify-center rounded-full"
            style:background-color={color}
          >
            {#if selected}
              <CheckIcon class="size-3 text-white" aria-hidden="true" />
            {/if}
          </span>
        </button>
      {/each}
    </div>
    <form
      class="mt-2 flex items-center gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        if (!HEX_RE.test(draft)) return;
        onChange(draft.toLowerCase());
        open = false;
      }}
    >
      <span
        class="size-4 shrink-0 rounded-full border"
        style:background-color={HEX_RE.test(draft) ? draft : 'transparent'}
        aria-hidden="true"
      ></span>
      <Input
        bind:value={
          () => draft,
          (v) => {
            const next = (v ?? '').trim();
            draft = next.startsWith('#') ? next : `#${next}`;
          }
        }
        onblur={() => {
          if (HEX_RE.test(draft) && draft.toLowerCase() !== value.toLowerCase()) {
            onChange(draft.toLowerCase());
          }
        }}
        maxlength={7}
        aria-label="Hex color"
        aria-invalid={!HEX_RE.test(draft) ? true : undefined}
        class={cn('h-7 font-mono text-xs')}
      />
    </form>
  </PopoverContent>
</Popover>
