<!--
  Bare searchable issue list, for popovers / dialogs (port of IssueSearchOptions
  in src/components/issue-hierarchy/issue-search-picker.tsx).
-->
<script module lang="ts">
  import type { IssueRow } from '@/lib/issue-model';

  export type IssueRef = Pick<IssueRow, 'id' | 'key' | 'title' | 'state'>;

  export interface IssueSearchOptionsProps<T extends IssueRef> {
    /** Candidates, e.g. `mutations.issues`. Pending (unsaved) issues are skipped. */
    issues: readonly T[];
    onSelect: (issue: T) => void;
    /** Ids to leave out (self, current children, …). */
    exclude?: ReadonlySet<string> | readonly string[];
    /** Checked issue id. */
    value?: string | null;
    /** Adds a first "clear" item (e.g. "Remove parent"). */
    onClear?: () => void;
    clearLabel?: string;
    placeholder?: string;
  }

  // Rendering thousands of command items makes typing lag; nobody scrolls past this.
  const MAX_RESULTS = 50;

  function search<T extends IssueRef>(issues: readonly T[], query: string): T[] {
    const q = query.trim().toLowerCase();
    if (!q) return issues.slice(0, MAX_RESULTS);
    const tokens = q.split(/\s+/);
    const exact: T[] = [];
    const rest: T[] = [];
    for (const issue of issues) {
      const key = issue.key.toLowerCase();
      if (key === q) exact.push(issue);
      else {
        const text = `${key} ${issue.title.toLowerCase()}`;
        if (tokens.every((token) => text.includes(token))) rest.push(issue);
      }
      if (exact.length + rest.length >= MAX_RESULTS * 2) break;
    }
    return [...exact, ...rest].slice(0, MAX_RESULTS);
  }
</script>

<script lang="ts" generics="T extends IssueRef">
  import XIcon from '@lucide/svelte/icons/x';

  import { isPendingIssue } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/lib/components/ui/command';
  import { StateIcon } from '@/lib/components/ui-icons';

  let {
    issues,
    onSelect,
    exclude,
    value,
    onClear,
    clearLabel = 'Clear',
    placeholder = 'Search issues…',
  }: IssueSearchOptionsProps<T> = $props();

  let query = $state('');
  const candidates = $derived.by(() => {
    const skip = new Set(exclude);
    return issues.filter((issue) => !skip.has(issue.id) && !isPendingIssue(issue as IssueRef as IssueRow));
  });
  const results = $derived(search(candidates, query));
</script>

<Command shouldFilter={false}>
  <CommandInput bind:value={query} {placeholder} />
  <CommandList>
    <CommandEmpty>No issues found.</CommandEmpty>
    {#if onClear && !query}
      <CommandGroup>
        <CommandItem value="__clear" onSelect={onClear}>
          <XIcon class="text-muted-foreground" />
          {clearLabel}
        </CommandItem>
      </CommandGroup>
    {/if}
    {#if results.length > 0}
      <CommandGroup>
        {#each results as issue (issue.id)}
          <CommandItem value={issue.id} data-checked={issue.id === value} onSelect={() => onSelect(issue)}>
            <StateIcon state={issue.state} size={14} />
            <span class="shrink-0 font-mono text-xs text-muted-foreground">
              {issue.key}
            </span>
            <span class="truncate">{issue.title}</span>
          </CommandItem>
        {/each}
      </CommandGroup>
    {/if}
  </CommandList>
</Command>
