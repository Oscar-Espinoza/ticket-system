<!-- Searchable timezone combobox (~400 IANA zones is too many for a plain select). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import CheckIcon from '@lucide/svelte/icons/check';
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

  import { Button } from '@/lib/components/ui/button';
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { cn } from '@/lib/utils';

  let {
    id,
    name,
    timezones,
    defaultValue,
  }: {
    id: string;
    /** Form field name; the value is submitted through a hidden input. */
    name: string;
    timezones: string[];
    defaultValue: string;
  } = $props();

  let open = $state(false);
  let value = $state(untrack(() => defaultValue));

  const detect = () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) value = zone;
  };
</script>

<div class="flex items-center gap-2">
  <input type="hidden" {name} {value} />
  <Popover bind:open>
    <PopoverTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          {id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          class="w-full max-w-xs justify-between font-normal"
        >
          <span class={cn('truncate', !value && 'text-muted-foreground')}>
            {value ? value.replaceAll('_', ' ') : 'Not set'}
          </span>
          <ChevronsUpDownIcon class="opacity-50" />
        </Button>
      {/snippet}
    </PopoverTrigger>
    <PopoverContent class="w-72 p-0" align="start">
      <Command>
        <CommandInput placeholder="Search timezones…" />
        <CommandList>
          <CommandEmpty>No timezone found.</CommandEmpty>
          {#each timezones as zone (zone)}
            <CommandItem
              value={zone}
              keywords={[zone.replaceAll('_', ' ')]}
              onSelect={() => {
                value = zone;
                open = false;
              }}
            >
              <CheckIcon class={cn(zone === value ? 'opacity-100' : 'opacity-0')} />
              {zone.replaceAll('_', ' ')}
            </CommandItem>
          {/each}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
  <Button type="button" variant="ghost" size="sm" onclick={detect}>
    Use this device&rsquo;s
  </Button>
</div>
