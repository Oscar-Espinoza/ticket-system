<!--
  Searchable list of the viewer's repositories (most recently pushed first).
  Typing a literal "owner/name" offers it too, for repos outside the first 100.
-->
<script lang="ts">
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import LockIcon from '@lucide/svelte/icons/lock';

  import { listGithubRepos, type GithubRepoOption } from '@/lib/actions/github';
  import { keywordFilter } from '@/lib/components/issue-pickers/picker-utils';
  import { Button } from '@/lib/components/ui/button';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';

  const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

  let {
    projectId,
    value,
    onChange,
    disabled,
  }: {
    projectId: string;
    value: string | null;
    onChange: (repo: string) => void;
    disabled?: boolean;
  } = $props();

  let open = $state(false);
  let search = $state('');
  let repos = $state.raw<GithubRepoOption[] | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open || repos) return;
    const id = projectId;
    let cancelled = false;
    void listGithubRepos(id).then((result) => {
      if (cancelled) return;
      if (result.ok) repos = result.repos;
      else error = result.error;
    });
    return () => {
      cancelled = true;
    };
  });

  const literal = $derived(search.trim());
  const offerLiteral = $derived(
    REPO_RE.test(literal) &&
      !repos?.some((repo) => repo.fullName.toLowerCase() === literal.toLowerCase()),
  );

  const pick = (repo: string) => {
    onChange(repo);
    open = false;
  };
</script>

<Popover
  {open}
  onOpenChange={(next) => {
    if (next) error = null; // retry a failed load on reopen
    open = next;
  }}
>
  <PopoverTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        {disabled}
        class="w-full max-w-sm justify-between font-normal"
      >
        <span class={value ? 'truncate font-mono text-xs' : 'text-muted-foreground'}>
          {value ?? 'Select a repository…'}
        </span>
        <ChevronsUpDownIcon class="text-muted-foreground" />
      </Button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="start" class="w-(--bits-popover-anchor-width) min-w-72 gap-0 p-0">
    <Command filter={keywordFilter}>
      <CommandInput
        value={search}
        onValueChange={(next) => (search = next)}
        placeholder="Search repositories or type owner/name…"
      />
      <CommandList>
        {#if !repos && !error}
          <div class="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" /> Loading repositories…
          </div>
        {/if}
        {#if error}
          <p class="px-3 py-6 text-sm text-destructive">{error}</p>
        {/if}
        {#if repos}
          <CommandEmpty>No repository matches.</CommandEmpty>
        {/if}
        {#if offerLiteral}
          <CommandGroup>
            <CommandItem
              value="literal:{literal}"
              keywords={[literal]}
              onSelect={() => pick(literal)}
            >
              Use <span class="font-mono text-xs">{literal}</span>
            </CommandItem>
          </CommandGroup>
        {/if}
        {#if repos && repos.length > 0}
          <CommandGroup heading="Recently pushed">
            {#each repos as repo (repo.fullName)}
              <CommandItem
                value={repo.fullName}
                keywords={[repo.fullName]}
                data-checked={repo.fullName === value}
                onSelect={() => pick(repo.fullName)}
              >
                <span class="truncate font-mono text-xs">{repo.fullName}</span>
                {#if repo.private}
                  <LockIcon class="size-3 text-muted-foreground" aria-label="Private" />
                {/if}
                {#if !repo.admin}
                  <span class="ml-auto text-xs text-muted-foreground">no admin</span>
                {/if}
              </CommandItem>
            {/each}
          </CommandGroup>
        {/if}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
