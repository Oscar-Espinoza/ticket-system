'use client';

// Pick another issue by key or title. Shared: parent, sub-issues and relations
// use it; other features can too (pass any list of the project's issues).

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { StateIcon } from '@/components/ui-icons';
import {
  PickerPopover,
  type PickerPopoverProps,
} from '@/components/issue-pickers/picker-popover';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';

export type IssueRef = Pick<IssueRow, 'id' | 'key' | 'title' | 'state'>;

// Rendering thousands of cmdk items makes typing lag; nobody scrolls past this.
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

/** Bare searchable list, for popovers / dialogs. */
export function IssueSearchOptions<T extends IssueRef>({
  issues,
  onSelect,
  exclude,
  value,
  onClear,
  clearLabel = 'Clear',
  placeholder = 'Search issues…',
}: IssueSearchOptionsProps<T>) {
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => {
    const skip = new Set(exclude);
    return issues.filter(
      (issue) => !skip.has(issue.id) && !isPendingIssue(issue as IssueRef as IssueRow),
    );
  }, [issues, exclude]);
  const results = useMemo(() => search(candidates, query), [candidates, query]);

  return (
    <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>No issues found.</CommandEmpty>
        {onClear && !query && (
          <CommandGroup>
            <CommandItem value="__clear" onSelect={onClear}>
              <X className="text-muted-foreground" />
              {clearLabel}
            </CommandItem>
          </CommandGroup>
        )}
        {results.length > 0 && (
          <CommandGroup>
            {results.map((issue) => (
              <CommandItem
                key={issue.id}
                value={issue.id}
                data-checked={issue.id === value}
                onSelect={() => onSelect(issue)}
              >
                <StateIcon state={issue.state} size={14} />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {issue.key}
                </span>
                <span className="truncate">{issue.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

/** Popover picker; the trigger is `children` (asChild). */
export function IssueSearchPicker<T extends IssueRef>({
  onSelect,
  onClear,
  issues,
  exclude,
  value,
  clearLabel,
  placeholder,
  ...popover
}: PickerPopoverProps & IssueSearchOptionsProps<T>) {
  return (
    <PickerPopover
      {...popover}
      className="w-80"
      content={(close) => (
        <IssueSearchOptions
          issues={issues}
          exclude={exclude}
          value={value}
          clearLabel={clearLabel}
          placeholder={placeholder}
          onSelect={(issue) => {
            close();
            onSelect(issue);
          }}
          onClear={
            onClear &&
            (() => {
              close();
              onClear();
            })
          }
        />
      )}
    />
  );
}
