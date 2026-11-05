<!-- Read-only chips for the filter terms of a query (search page header).
     Port of SearchTermChips in src/components/views/search-syntax-help.tsx. -->
<script lang="ts">
  import { formatSearchTerm, parseSearchQuery } from '@/lib/issue-filtering';
  import { cn } from '@/lib/utils';

  let { query, class: className }: { query: string; class?: string } = $props();

  const terms = $derived(parseSearchQuery(query).terms);
</script>

{#if terms.length > 0}
  <ul aria-label="Search filters" class={cn('flex flex-wrap gap-1', className)}>
    {#each terms as term}
      <li
        class={cn(
          'inline-flex h-6 items-center rounded-md border border-border px-2 font-mono text-xs',
          term.negate ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {formatSearchTerm(term)}
      </li>
    {/each}
  </ul>
{/if}
