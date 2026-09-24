'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { StatusIcon } from '@/components/ui-icons';
import { registerHotkeys } from '@/lib/hotkeys';
import type { IssueGroup, IssueRow as Issue } from '@/lib/issue-model';
import { IssueRow } from './issue-row';
import type { IssueMutations } from './use-issue-mutations';

export function IssueList({
  groups,
  mutations,
  selectedId,
  onSelect,
}: {
  groups: IssueGroup[];
  mutations: IssueMutations;
  selectedId?: string | null;
  onSelect?: (issue: Issue) => void;
}) {
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const flat = groups.flatMap((group) => group.issues);

  const focusRow = (id: string) => {
    setCursorId(id);
    rowRefs.current.get(id)?.focus();
  };

  const move = useEffectEvent((delta: 1 | -1) => {
    if (flat.length === 0) return;
    const index = flat.findIndex((issue) => issue.id === cursorId);
    const next =
      index === -1
        ? delta === 1
          ? 0
          : flat.length - 1
        : Math.min(flat.length - 1, Math.max(0, index + delta));
    focusRow(flat[next].id);
  });

  const openStatusMenu = useEffectEvent(() => {
    const focused = document.activeElement?.closest<HTMLElement>('[data-issue-row]');
    const id = focused?.dataset.issueRow ?? cursorId;
    if (id && flat.some((issue) => issue.id === id)) setStatusMenuFor(id);
  });

  const openFocused = useEffectEvent(() => {
    const focused = document.activeElement?.closest<HTMLElement>('[data-issue-row]');
    const issue = flat.find((i) => i.id === focused?.dataset.issueRow);
    if (issue && onSelect) onSelect(issue);
  });

  useEffect(
    () =>
      registerHotkeys([
        { key: 'j', scope: 'Issues', description: 'Next issue', handler: () => move(1) },
        { key: 'k', scope: 'Issues', description: 'Previous issue', handler: () => move(-1) },
        {
          key: 's',
          scope: 'Issues',
          description: 'Change status of focused issue',
          handler: () => openStatusMenu(),
        },
      ]),
    [],
  );

  // Enter only means something once a detail view exists to open.
  const selectable = Boolean(onSelect);
  useEffect(() => {
    if (!selectable) return;
    return registerHotkeys([
      {
        key: 'Enter',
        scope: 'Issues',
        description: 'Open focused issue',
        when: (event) =>
          event.target instanceof HTMLElement && event.target.hasAttribute('data-issue-row'),
        handler: () => openFocused(),
      },
    ]);
  }, [selectable]);

  return (
    <div data-issue-list className="flex flex-col">
      {groups.map((group) => (
        <section key={group.status} aria-labelledby={`group-${group.status}`}>
          <h2
            id={`group-${group.status}`}
            className="sticky top-0 z-10 -mx-2 flex h-8 items-center gap-2 border-b border-border bg-background px-4 text-xs font-medium text-muted-foreground"
          >
            <StatusIcon status={group.status} size={14} />
            <span className="text-foreground">{group.label}</span>
            <span className="tabular-nums">{group.issues.length}</span>
          </h2>
          {group.issues.length > 0 && (
            <ul className="flex flex-col py-1">
              {group.issues.map((issue) => (
                <li key={issue.id}>
                  <IssueRow
                    ref={(el) => {
                      if (el) rowRefs.current.set(issue.id, el);
                      else rowRefs.current.delete(issue.id);
                    }}
                    issue={issue}
                    active={issue.id === selectedId}
                    statusMenuOpen={statusMenuFor === issue.id}
                    onStatusMenuOpenChange={(open) =>
                      setStatusMenuFor(open ? issue.id : null)
                    }
                    onStatusChange={(status) => mutations.setStatus(issue, status)}
                    onFocus={() => setCursorId(issue.id)}
                    onSelect={onSelect ? () => onSelect(issue) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
