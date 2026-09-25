'use client';

// Horizontal bars for "open issues by …" breakdowns. Every value is printed, so
// no hover layer is needed; states keep their own colour (colour follows the
// entity), everything else uses the brand colour.

import { useState } from 'react';

import { Avatar, PriorityIcon, StatusIcon } from '@/components/ui-icons';
import { PRIORITY_LABEL } from '@/lib/issue-model';
import type { BreakdownRow } from '@/lib/insights';

const VISIBLE = 8;

function Glyph({ row, kind }: { row: BreakdownRow; kind: BarListKind }) {
  if (kind === 'state' && row.stateType) {
    return <StatusIcon type={row.stateType} color={row.color ?? undefined} size={14} />;
  }
  if (kind === 'priority' && row.priority) return <PriorityIcon priority={row.priority} size={14} />;
  if (kind === 'assignee') return <Avatar name={row.label} src={row.image} size={20} />;
  return (
    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color ?? undefined }} />
  );
}

export type BarListKind = 'state' | 'priority' | 'assignee' | 'label';

export function BarList({
  rows,
  kind,
  empty = 'No open issues.',
}: {
  rows: BreakdownRow[];
  kind: BarListKind;
  empty?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  const shown = expanded ? rows : rows.slice(0, VISIBLE);

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col gap-1.5">
        {shown.map((row) => {
          const label = kind === 'priority' && row.priority ? PRIORITY_LABEL[row.priority] : row.label;
          return (
            <li key={row.id} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Glyph row={row} kind={kind} />
                <span className="truncate">{label}</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className={kind === 'state' ? 'block h-full rounded-full' : 'block h-full rounded-full bg-primary/80'}
                  style={{
                    width: `${Math.max(2, (row.count / max) * 100)}%`,
                    backgroundColor: kind === 'state' ? (row.color ?? undefined) : undefined,
                  }}
                />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{row.count}</span>
            </li>
          );
        })}
      </ul>
      {rows.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 self-start text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Show less' : `Show ${rows.length - VISIBLE} more`}
        </button>
      )}
    </div>
  );
}
