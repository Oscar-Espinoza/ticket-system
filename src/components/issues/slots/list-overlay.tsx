'use client';

// Owner: B6 (peek preview). Rendered once next to the issues view: Space on a
// focused list row opens a read-only preview; Enter there opens the detail
// pane via `onOpen`. Guarded to `[data-issue-row]` focus so the board's own
// Space pick-up (dnd-kit, on board cards) is untouched.

import { useEffect, useEffectEvent, useState } from 'react';

import { IssuePeek } from '@/components/navigation/issue-peek';
import type { IssueRow } from '@/lib/issue-model';
import { registerHotkeys } from '@/lib/hotkeys';

function focusedRowId(event: KeyboardEvent): string | null {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest<HTMLElement>('[data-issue-row]')?.dataset.issueRow ?? null;
}

export function ListOverlay({
  issues,
  onOpen,
}: {
  issues: IssueRow[];
  onOpen: (issue: IssueRow) => void;
}) {
  const [peekId, setPeekId] = useState<string | null>(null);
  // Always the latest copy (optimistic edits), and closes if it leaves the list.
  const peeked = peekId ? (issues.find((i) => i.id === peekId) ?? null) : null;

  const peek = useEffectEvent((event: KeyboardEvent) => {
    const id = focusedRowId(event);
    if (id && issues.some((i) => i.id === id)) setPeekId(id);
  });

  useEffect(
    () =>
      registerHotkeys([
        {
          key: ' ',
          scope: 'Issues',
          description: 'Peek at the focused issue',
          when: (event) => focusedRowId(event) !== null,
          handler: (event) => peek(event),
        },
      ]),
    [],
  );

  return (
    <IssuePeek
      issue={peeked}
      onClose={() => setPeekId(null)}
      onOpen={(issue) => {
        setPeekId(null);
        onOpen(issue);
      }}
    />
  );
}
