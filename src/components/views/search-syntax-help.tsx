'use client';

// "?" popover listing the query syntax (lib/issue-filtering SEARCH_SYNTAX_HELP).
// Clicking an example hands it to `onInsert` (appended to the query box).

import { CircleHelp } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SEARCH_SYNTAX_HELP, parseSearchQuery, formatSearchTerm } from '@/lib/issue-filtering';
import { cn } from '@/lib/utils';

export function SearchSyntaxHelp({
  onInsert,
  className,
  note,
}: {
  onInsert?: (token: string) => void;
  className?: string;
  /** Extra line under the heading (e.g. what free text matches here). */
  note?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search syntax"
          title="Search syntax"
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] gap-0 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Search syntax</p>
          <p className="text-xs text-muted-foreground">
            {note ?? 'Combine filters with free text.'} Quote values with spaces, separate
            alternatives with commas, prefix with - to exclude.
          </p>
        </div>
        <dl className="max-h-80 overflow-y-auto px-1 py-1 text-xs">
          {SEARCH_SYNTAX_HELP.map((entry) => (
            <div key={entry.key} className="grid grid-cols-[4.5rem_1fr] items-start gap-2 rounded px-2 py-1">
              <dt className="pt-0.5 font-mono text-muted-foreground">{entry.key}:</dt>
              <dd className="flex min-w-0 flex-col gap-1">
                <span className="text-muted-foreground">{entry.description}</span>
                <span className="flex flex-wrap gap-1">
                  {entry.examples.map((example) =>
                    onInsert ? (
                      <button
                        key={example}
                        type="button"
                        onClick={() => onInsert(example)}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {example}
                      </button>
                    ) : (
                      <code key={example} className="rounded bg-muted px-1.5 py-0.5">
                        {example}
                      </code>
                    ),
                  )}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** Read-only chips for the filter terms of a query (search page header). */
export function SearchTermChips({ query, className }: { query: string; className?: string }) {
  const { terms } = parseSearchQuery(query);
  if (terms.length === 0) return null;
  return (
    <ul aria-label="Search filters" className={cn('flex flex-wrap gap-1', className)}>
      {terms.map((term, index) => (
        <li
          key={index}
          className={cn(
            'inline-flex h-6 items-center rounded-md border border-border px-2 font-mono text-xs',
            term.negate ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {formatSearchTerm(term)}
        </li>
      ))}
    </ul>
  );
}

/** Appends `token` to `query` with a separating space. */
export function appendToken(query: string, token: string): string {
  const base = query.trimEnd();
  return base ? `${base} ${token} ` : `${token} `;
}
