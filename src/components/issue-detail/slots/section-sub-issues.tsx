'use client';

// Owner: B4. Sub-issues: the children in `mutations.issues` (optimistic, no
// fetch), progress, inline create (inherits cycle / epic / milestone), attach
// an existing issue, detach, and open a child.

import { useState } from 'react';
import { Link2, Plus } from 'lucide-react';

import { IssueRefRow, SectionHeader } from '@/components/issue-hierarchy/issue-ref-row';
import { IssueSearchPicker } from '@/components/issue-hierarchy/issue-search-picker';
import { ancestorIds } from '@/components/issue-hierarchy/tree';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { StatusIcon } from '@/components/ui-icons';
import type { IssueRow } from '@/lib/issue-model';
import { isClosed } from '@/lib/workflow';

export function SectionSubIssues({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const canWrite = useProjectPermission('write');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const children = mutations.issues.filter((i) => i.parentId === issue.id);
  // Manual order, then creation order — new sub-issues land at the bottom.
  const ordered = children.toSorted(
    (a, b) => a.sortOrder - b.sortOrder || +new Date(a.createdAt) - +new Date(b.createdAt),
  );
  const done = children.filter((child) => isClosed(child.state.type)).length;
  const percent = children.length ? Math.round((done / children.length) * 100) : 0;

  if (children.length === 0 && !canWrite) return null;

  const create = () => {
    const next = title.trim();
    if (!next) return;
    mutations.create({
      title: next,
      parentId: issue.id,
      cycleId: issue.cycleId,
      epicId: issue.epicId,
      milestoneId: issue.milestoneId,
    });
    setTitle('');
  };

  const closeInput = () => {
    setAdding(false);
    setTitle('');
  };

  const exclude = () => {
    const ids = ancestorIds(mutations.issues, issue.id);
    ids.add(issue.id);
    for (const child of children) ids.add(child.id);
    return ids;
  };

  return (
    <section aria-label="Sub-issues" className="flex flex-col gap-1">
      <SectionHeader
        title="Sub-issues"
        meta={
          children.length > 0 && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusIcon type={done === children.length ? 'completed' : 'started'} percent={percent} size={14} />
              <span className="tabular-nums">
                {done}/{children.length}
              </span>
              <Progress value={percent} className="w-16" aria-label={`${percent}% done`} />
            </span>
          )
        }
      >
        {canWrite && (
          <>
            <IssueSearchPicker
              issues={mutations.issues}
              exclude={exclude()}
              placeholder="Add existing issue as sub-issue…"
              align="end"
              onSelect={(child) => mutations.update(child, { parentId: issue.id })}
            >
              <Button variant="ghost" size="icon-xs" aria-label="Add existing issue" title="Add existing issue">
                <Link2 />
              </Button>
            </IssueSearchPicker>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add sub-issue"
              title="Add sub-issue"
              onClick={() => setAdding(true)}
            >
              <Plus />
            </Button>
          </>
        )}
      </SectionHeader>

      {ordered.length > 0 && (
        <div className="flex flex-col">
          {ordered.map((child) => (
            <IssueRefRow
              key={child.id}
              issue={child}
              removeLabel="Remove from parent"
              onRemove={canWrite ? () => mutations.update(child, { parentId: null }) : undefined}
            />
          ))}
        </div>
      )}

      {adding ? (
        <form
          className="flex items-center gap-2 px-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <StatusIcon type="unstarted" size={14} />
          <Input
            autoFocus
            aria-label="Sub-issue title"
            placeholder="Sub-issue title — Enter to create, Esc to close"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (!title.trim()) closeInput();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeInput();
              }
            }}
            className="h-7 border-transparent bg-transparent px-1 text-sm shadow-none focus-visible:border-border dark:bg-transparent"
          />
        </form>
      ) : (
        canWrite &&
        children.length === 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit gap-2 font-normal text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus />
            Add sub-issue
          </Button>
        )
      )}
    </section>
  );
}
