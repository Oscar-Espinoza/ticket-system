'use client';

import { cn } from '@/lib/utils';
import type { IssueViewDefinition } from './views';

export function ViewSwitcher({
  views,
  current,
  onChange,
}: {
  views: IssueViewDefinition[];
  current: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="inline-flex h-7 items-center rounded-md border border-border p-0.5"
    >
      {views.map((view) => {
        const Icon = view.icon;
        const selected = view.id === current;
        return (
          <button
            key={view.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(view.id)}
            className={cn(
              'inline-flex h-full items-center gap-1.5 rounded px-2 text-xs font-medium outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
