<!--
  Searchable customer list of SectionCustomers (React's local CustomerOptions);
  `onCreate` adds a "Create customer" item for new names.
-->
<script lang="ts">
  import UserPlusIcon from '@lucide/svelte/icons/user-plus';

  import { formatRevenue, type CustomerOption } from '@/lib/components/customers/customer-model';
  import CustomerLogo from '@/lib/components/customers/customer-logo.svelte';
  import { keywordFilter } from '@/lib/components/issue-pickers/picker-utils';
  import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/lib/components/ui/command';

  let {
    options,
    onSelect,
    onCreate,
  }: {
    options: CustomerOption[];
    onSelect: (option: CustomerOption) => void;
    onCreate?: (name: string) => void;
  } = $props();

  let search = $state('');
  const name = $derived(search.trim());
  const exact = $derived(options.some((o) => o.name.toLowerCase() === name.toLowerCase()));
</script>

<Command filter={keywordFilter}>
  <CommandInput bind:value={search} placeholder={onCreate ? 'Find or create customer…' : 'Find customer…'} />
  <CommandList>
    <CommandEmpty>{onCreate ? 'Type a name to create a customer.' : 'No customers found.'}</CommandEmpty>
    {#if options.length > 0}
      <CommandGroup>
        {#each options as option (option.id)}
          <CommandItem value={option.id} keywords={[option.name, ...option.domains]} onSelect={() => onSelect(option)}>
            <CustomerLogo name={option.name} size={16} />
            <span class="truncate">{option.name}</span>
            {#if option.revenue != null}
              <span class="ml-auto text-xs text-muted-foreground tabular-nums">
                {formatRevenue(option.revenue)}
              </span>
            {/if}
          </CommandItem>
        {/each}
      </CommandGroup>
    {/if}
    {#if onCreate && name && !exact}
      <CommandGroup forceMount>
        <CommandItem value="__create__" keywords={[name]} forceMount onSelect={() => onCreate(name)}>
          <UserPlusIcon />
          <span class="truncate">Create customer “{name}”</span>
        </CommandItem>
      </CommandGroup>
    {/if}
  </CommandList>
</Command>
