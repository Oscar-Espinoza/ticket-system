<!-- Mark a triage issue as a duplicate (issue search). -->
<script lang="ts">
  import { keywordFilter } from '@/lib/components/issue-pickers/picker-utils';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { StateIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';

  let {
    issue,
    candidates,
    open = $bindable(false),
    onOpenChange,
    onPick,
  }: {
    issue: IssueRow;
    /** Issues it may duplicate (the triage issue itself excluded by the caller). */
    candidates: IssueRow[];
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    onPick: (original: IssueRow) => void;
  } = $props();

  const setOpen = (next: boolean) => {
    open = next;
    onOpenChange?.(next);
  };
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
    <DialogHeader class="sr-only">
      <DialogTitle>Mark {issue.key} as duplicate</DialogTitle>
      <DialogDescription>Search for the original issue.</DialogDescription>
    </DialogHeader>
    <Command filter={keywordFilter}>
      <!-- svelte-ignore a11y_autofocus -->
      <CommandInput placeholder="{issue.key} is a duplicate of…" autofocus />
      <CommandList class="max-h-80">
        <CommandEmpty>No issue found.</CommandEmpty>
        <CommandGroup>
          {#each candidates as candidate (candidate.id)}
            <CommandItem
              value={candidate.id}
              keywords={[candidate.key, candidate.title]}
              onSelect={() => onPick(candidate)}
            >
              <StateIcon state={candidate.state} size={14} />
              <span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">{candidate.key}</span>
              <span class="truncate">{candidate.title}</span>
            </CommandItem>
          {/each}
        </CommandGroup>
      </CommandList>
    </Command>
  </DialogContent>
</Dialog>
