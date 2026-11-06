<!--
  One segmented chip per filtered property; click edits, × removes.
-->
<script lang="ts">
  import XIcon from '@lucide/svelte/icons/x';

  import type { IssueFilters } from '@/lib/issue-filtering';
  import { useFilterProperties, valuesText, type FilterProperty, type FilterPropertyId } from './filter-properties.svelte';

  let {
    filters,
    onChange,
    onEdit,
  }: {
    filters: IssueFilters;
    onChange: (next: IssueFilters) => void;
    onEdit: (property: FilterPropertyId) => void;
  } = $props();

  const properties = useFilterProperties();

  function operatorOf(property: FilterProperty, values: string[]): string {
    return property.single
      ? 'in'
      : values.length > 1
        ? property.id === 'labels'
          ? 'include any of'
          : 'is any of'
        : property.id === 'labels'
          ? 'include'
          : 'is';
  }
</script>

{#each properties.current as property (property.id)}
  {@const values = property.get(filters)}
  {#if values.length > 0}
    <span class="inline-flex h-7 max-w-80 items-center overflow-hidden rounded-md border border-border text-xs">
      <button
        type="button"
        onclick={() => onEdit(property.id)}
        class="flex min-w-0 items-center gap-1.5 px-2 outline-none hover:bg-muted focus-visible:bg-muted"
        aria-label={`Edit ${property.label} filter`}
      >
        <property.icon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="shrink-0">{property.label}</span>
        <span class="shrink-0 text-muted-foreground">{operatorOf(property, values)}</span>
        <span class="truncate font-medium">{valuesText(property, values)}</span>
      </button>
      <button
        type="button"
        onclick={() => onChange(property.set(filters, []))}
        aria-label={`Remove ${property.label} filter`}
        class="flex h-full items-center border-l border-border px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted"
      >
        <XIcon class="size-3" />
      </button>
    </span>
  {/if}
{/each}
