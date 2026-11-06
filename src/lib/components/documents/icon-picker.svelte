<!-- Emoji icon picker for a document. -->
<script lang="ts">
  import SmilePlus from '@lucide/svelte/icons/smile-plus';

  import { DOCUMENT_ICONS } from '@/lib/document-model';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { cn } from '@/lib/utils';

  let {
    icon,
    disabled,
    onChange,
  }: {
    icon: string | null;
    disabled: boolean;
    onChange: (icon: string | null) => void;
  } = $props();

  let open = $state(false);
</script>

{#if !(disabled && !icon)}
  <Popover bind:open>
    <PopoverTrigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          {disabled}
          aria-label={icon ? 'Change icon' : 'Add icon'}
          class={cn(
            'flex w-fit items-center gap-1.5 rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none',
            icon ? 'size-12 justify-center text-4xl leading-none' : 'h-6 px-1.5 text-xs',
          )}
        >
          {#if icon}
            {icon}
          {:else}
            <SmilePlus class="size-3.5" aria-hidden="true" />
            Add icon
          {/if}
        </button>
      {/snippet}
    </PopoverTrigger>
    <PopoverContent align="start" class="w-auto p-2">
      <div role="listbox" aria-label="Icons" class="grid grid-cols-8 gap-0.5">
        {#each DOCUMENT_ICONS as option (option)}
          <button
            type="button"
            role="option"
            aria-selected={option === icon}
            onclick={() => {
              open = false;
              onChange(option);
            }}
            class={cn(
              'flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
              option === icon && 'bg-accent',
            )}
          >
            {option}
          </button>
        {/each}
      </div>
      {#if icon}
        <button
          type="button"
          onclick={() => {
            open = false;
            onChange(null);
          }}
          class="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Remove icon
        </button>
      {/if}
    </PopoverContent>
  </Popover>
{/if}
