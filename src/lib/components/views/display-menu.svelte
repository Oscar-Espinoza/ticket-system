<!--
  The "Display" popover (Shift+V): layout, grouping, sub-grouping, ordering,
  toggles and visible properties — all written through useDisplayOptions().
  Port of DisplayMenu in src/components/views/display-menu.tsx (same props;
  pass the registry's ISSUE_VIEWS as `views`).
-->
<script module lang="ts">
  import type { IssueViewDefinition } from '@/lib/components/issues/views';

  /** The parts of an IssueViewDefinition the menu reads. */
  export type DisplayMenuView = Pick<IssueViewDefinition, 'id' | 'label' | 'icon'>;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';

  import { Button } from '@/lib/components/ui/button';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Switch } from '@/lib/components/ui/switch';
  import {
    DEFAULT_DISPLAY_OPTIONS,
    DISPLAY_PROPERTY_LABEL,
    useDisplayOptions,
    type DisplayOptions,
    type DisplayProperty,
  } from '@/lib/components/issues/display-options.svelte';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import {
    GROUP_BY_LABEL,
    GROUP_BY_OPTIONS,
    ORDER_BY_LABEL,
    ORDER_BY_OPTIONS,
    isGroupBy,
    isOrderBy,
    type GroupBy,
  } from '@/lib/issue-grouping';
  import { cn } from '@/lib/utils';

  let {
    views,
    layout,
    onLayoutChange,
  }: {
    views: DisplayMenuView[];
    layout: string;
    onLayoutChange: (id: string) => void;
  } = $props();

  const NO_SUBGROUP = '__none';

  // Pull requests aren't part of IssueRow, so there's nothing to toggle yet.
  const TOGGLEABLE: DisplayProperty[] = [
    'id',
    'status',
    'priority',
    'assignee',
    'labels',
    'estimate',
    'dueDate',
    'startDate',
    'sla',
    'cycle',
    'epic',
    'milestone',
    'subIssues',
    'created',
    'updated',
  ];

  const displayOptions = useDisplayOptions();
  const display = $derived(displayOptions.current);
  const data = useProjectData();
  let open = $state(false);

  $effect(() =>
    registerHotkeys([
      {
        key: 'v',
        shift: true,
        scope: 'Issues',
        description: 'Display options',
        handler: () => {
          open = !open;
        },
      },
    ]),
  );

  const update = (patch: Partial<DisplayOptions>) => displayOptions.set({ ...display, ...patch });
  const grouped = $derived(layout === 'list' || layout === 'board' || layout === 'timeline');
  const ordered = $derived(layout !== 'calendar');

  // Hide groupings the project can't use (no cycles / epics yet).
  const groupOptions = $derived(
    GROUP_BY_OPTIONS.filter(
      (g) =>
        (g !== 'cycle' || data.project.cyclesEnabled || data.cycles.length > 0 || display.groupBy === 'cycle') &&
        (g !== 'epic' || data.epics.length > 0 || display.groupBy === 'epic'),
    ),
  );
  const subOptions = $derived(groupOptions.filter((g) => g !== 'none' && g !== display.groupBy));

  // Board columns are always shown (drop targets); the switch then only governs
  // empty swimlanes.
  const boardColumnsOnly = $derived(layout === 'board' && display.subGroupBy === null);

  function setGroupBy(value: string) {
    if (!isGroupBy(value)) return;
    update({
      groupBy: value,
      subGroupBy: value === 'none' || display.subGroupBy === value ? null : display.subGroupBy,
    });
  }
</script>

{#snippet row(label: string, content: Snippet)}
  <div class="flex h-8 items-center justify-between gap-3 text-sm">
    <span class="text-muted-foreground">{label}</span>
    {@render content()}
  </div>
{/snippet}

{#snippet optionSelect(
  label: string,
  value: string,
  options: readonly string[],
  labels: Record<string, string>,
  onChange: (value: string) => void,
)}
  {#snippet select()}
    <Select
      bind:value={() => value, onChange}
      items={options.map((option) => ({ value: option, label: labels[option] }))}
    >
      <SelectTrigger size="sm" class="w-36 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {#each options as option (option)}
          <SelectItem value={option} class="text-xs">
            {labels[option]}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  {/snippet}
  {@render row(label, select)}
{/snippet}

{#snippet subGroupSelect()}
  <Select
    bind:value={
      () => display.subGroupBy ?? NO_SUBGROUP,
      (value) => update({ subGroupBy: isGroupBy(value) ? (value as GroupBy) : null })
    }
    items={[
      { value: NO_SUBGROUP, label: 'No sub-grouping' },
      ...subOptions.map((option) => ({ value: option, label: GROUP_BY_LABEL[option] })),
    ]}
  >
    <SelectTrigger size="sm" class="w-36 text-xs" aria-label="Sub-grouping">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={NO_SUBGROUP} class="text-xs">No sub-grouping</SelectItem>
      {#each subOptions as option (option)}
        <SelectItem value={option} class="text-xs">
          {GROUP_BY_LABEL[option]}
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
{/snippet}

{#snippet emptyGroupsSwitch()}
  <Switch
    size="sm"
    bind:checked={() => (boardColumnsOnly ? true : display.showEmptyGroups), (checked) => update({ showEmptyGroups: checked })}
    disabled={boardColumnsOnly}
    aria-label="Show empty groups"
  />
{/snippet}

{#snippet subIssuesSwitch()}
  <Switch
    size="sm"
    bind:checked={() => display.showSubIssues, (checked) => update({ showSubIssues: checked })}
    aria-label="Show sub-issues"
  />
{/snippet}

<Popover bind:open>
  <PopoverTrigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="sm" aria-label="Display options (Shift+V)" class="text-muted-foreground">
        <SlidersHorizontalIcon />
        Display
      </Button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="end" class="w-80 gap-0 p-0">
    <div role="radiogroup" aria-label="Layout" class="grid grid-cols-5 gap-1 border-b border-border p-2">
      {#each views as view (view.id)}
        {@const selected = view.id === layout}
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onclick={() => onLayoutChange(view.id)}
          class={cn(
            'flex flex-col items-center gap-1 rounded-md border py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            selected
              ? 'border-border bg-secondary text-foreground'
              : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <view.icon class="size-4" aria-hidden="true" />
          {view.label}
        </button>
      {/each}
    </div>

    <div class="flex flex-col px-3 py-2">
      {#if grouped}
        {@render optionSelect('Grouping', display.groupBy, groupOptions, GROUP_BY_LABEL, setGroupBy)}
        {#if display.groupBy !== 'none' && layout !== 'timeline'}
          {@render row(layout === 'board' ? 'Swimlanes' : 'Sub-grouping', subGroupSelect)}
        {/if}
      {/if}
      {#if ordered}
        {@render optionSelect('Ordering', display.orderBy, ORDER_BY_OPTIONS, ORDER_BY_LABEL, (value) => {
          if (isOrderBy(value)) update({ orderBy: value });
        })}
      {/if}
      {#if grouped}
        {@render row('Show empty groups', emptyGroupsSwitch)}
      {/if}
      {@render row('Show sub-issues', subIssuesSwitch)}
    </div>

    {#if layout !== 'calendar' && layout !== 'timeline'}
      <div class="border-t border-border px-3 py-2">
        <p class="mb-2 text-xs font-medium text-muted-foreground">Display properties</p>
        <div class="flex flex-wrap gap-1">
          {#each TOGGLEABLE as property (property)}
            {@const on = display.properties[property]}
            <button
              type="button"
              aria-pressed={on}
              onclick={() => update({ properties: { ...display.properties, [property]: !on } })}
              class={cn(
                'h-6 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                on
                  ? 'border-border bg-secondary text-foreground'
                  : 'border-dashed border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {DISPLAY_PROPERTY_LABEL[property]}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="flex justify-end border-t border-border px-2 py-1.5">
      <Button
        variant="ghost"
        size="xs"
        class="text-muted-foreground"
        onclick={() => displayOptions.set({ ...DEFAULT_DISPLAY_OPTIONS, layout: display.layout })}
      >
        Reset to default
      </Button>
    </div>
  </PopoverContent>
</Popover>
