<!-- Two steps in one popover: relation type, then the other issue. -->
<script lang="ts">
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';

  import IssueSearchOptions from '@/lib/components/issue-hierarchy/issue-search-options.svelte';
  import { Command, CommandItem, CommandList } from '@/lib/components/ui/command';
  import type { IssueRow } from '@/lib/issue-model';
  import type { AddableRelationKind, IssueRelationView } from '@/lib/relations';
  import { ADD_ORDER, KINDS, SAME_STORED } from './relation-kinds';

  let {
    issue,
    candidates,
    relations,
    onAdd,
  }: {
    issue: IssueRow;
    candidates: IssueRow[];
    relations: IssueRelationView[];
    onAdd: (kind: AddableRelationKind, other: IssueRow) => void;
  } = $props();

  let kind = $state<AddableRelationKind | null>(null);

  const exclude = $derived(
    kind
      ? [issue.id, ...relations.filter((r) => SAME_STORED[kind!].includes(r.kind)).map((r) => r.issue.id)]
      : [],
  );
</script>

{#if !kind}
  <Command>
    <CommandList>
      {#each ADD_ORDER as k (k)}
        {@const Icon = KINDS[k].icon}
        <CommandItem value={k} onSelect={() => (kind = k)}>
          <Icon class={KINDS[k].iconClass} />
          {KINDS[k].add}
        </CommandItem>
      {/each}
    </CommandList>
  </Command>
{:else}
  {@const current = kind}
  <div class="flex flex-col">
    <button
      type="button"
      onclick={() => (kind = null)}
      class="flex items-center gap-1 border-b border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
    >
      <ChevronLeftIcon class="size-3.5" />
      {KINDS[current].add}
    </button>
    <IssueSearchOptions issues={candidates} {exclude} placeholder="Search issues…" onSelect={(other) => onAdd(current, other)} />
  </div>
{/if}
