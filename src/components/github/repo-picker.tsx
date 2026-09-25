'use client';

// Searchable list of the viewer's repositories (most recently pushed first).
// Typing a literal "owner/name" offers it too, for repos outside the first 100.

import { useEffect, useState } from 'react';
import { ChevronsUpDown, Loader2, Lock } from 'lucide-react';

import { listGithubRepos, type GithubRepoOption } from '@/app/actions/github';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { keywordFilter } from '@/components/issue-pickers';

const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export function RepoPicker({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  value: string | null;
  onChange: (repo: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [repos, setRepos] = useState<GithubRepoOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || repos) return;
    let cancelled = false;
    listGithubRepos(projectId).then((result) => {
      if (cancelled) return;
      if (result.ok) setRepos(result.repos);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, repos, projectId]);

  const literal = search.trim();
  const offerLiteral =
    REPO_RE.test(literal) &&
    !repos?.some((repo) => repo.fullName.toLowerCase() === literal.toLowerCase());

  const pick = (repo: string) => {
    onChange(repo);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null); // retry a failed load on reopen
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full max-w-sm justify-between font-normal"
        >
          <span className={value ? 'truncate font-mono text-xs' : 'text-muted-foreground'}>
            {value ?? 'Select a repository…'}
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 gap-0 p-0">
        <Command filter={keywordFilter}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search repositories or type owner/name…"
          />
          <CommandList>
            {!repos && !error && (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading repositories…
              </div>
            )}
            {error && <p className="px-3 py-6 text-sm text-destructive">{error}</p>}
            {repos && <CommandEmpty>No repository matches.</CommandEmpty>}
            {offerLiteral && (
              <CommandGroup>
                <CommandItem value={`literal:${literal}`} keywords={[literal]} onSelect={() => pick(literal)}>
                  Use <span className="font-mono text-xs">{literal}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {repos && repos.length > 0 && (
              <CommandGroup heading="Recently pushed">
                {repos.map((repo) => (
                  <CommandItem
                    key={repo.fullName}
                    value={repo.fullName}
                    keywords={[repo.fullName]}
                    data-checked={repo.fullName === value}
                    onSelect={() => pick(repo.fullName)}
                  >
                    <span className="truncate font-mono text-xs">{repo.fullName}</span>
                    {repo.private && <Lock className="size-3 text-muted-foreground" aria-label="Private" />}
                    {!repo.admin && (
                      <span className="ml-auto text-xs text-muted-foreground">no admin</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
