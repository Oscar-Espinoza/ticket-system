<!-- Filter menu + chips for the one project in scope (needs ProjectData in context). -->
<script lang="ts">
  import type { ComponentProps } from 'svelte';

  import type { IssueFilters } from '@/lib/issue-filtering';
  import FilterChips from '@/lib/components/views/filter-chips.svelte';
  import FilterMenu from '@/lib/components/views/filter-menu.svelte';

  type FilterPropertyId = NonNullable<ComponentProps<typeof FilterMenu>['property']>;

  let { filters, onChange }: { filters: IssueFilters; onChange: (next: IssueFilters) => void } = $props();

  let menu = $state<{ open: boolean; property: FilterPropertyId | null }>({ open: false, property: null });
</script>

<div class="flex flex-wrap items-center gap-1.5">
  <FilterMenu
    {filters}
    {onChange}
    open={menu.open}
    property={menu.property}
    onOpenChange={(open: boolean) => (menu = { open, property: open ? menu.property : null })}
    onPropertyChange={(property: FilterPropertyId | null) => (menu = { ...menu, property })}
  />
  <FilterChips {filters} {onChange} onEdit={(property: FilterPropertyId) => (menu = { open: true, property })} />
</div>
