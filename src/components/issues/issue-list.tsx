'use client';

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { DragDropProvider, DragOverlay, PointerSensor, useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { ChevronRight, Plus, UserRound } from 'lucide-react';

import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { useSortableGroups, type SortableContainer } from '@/components/views/use-sortable-groups';
import { registerHotkeys } from '@/lib/hotkeys';
import { mergePatches, patchForNestedMove, type IssueGroup } from '@/lib/issue-grouping';
import type { IssuePatch, IssueRow as Issue } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { useDisplayOptions } from './display-options';
import { IssueRow } from './issue-row';
import { isPendingIssue, type IssueMutations } from './use-issue-mutations';

// Pointer only: Space on a focused row belongs to peek preview (B6).
const sensors = [PointerSensor];

/** Glyph for a group header: state icon, priority icon, avatar or color dot. */
export function GroupIcon({ group }: { group: IssueGroup }) {
  if (group.state) return <StateIcon state={group.state} size={14} />;
  if (group.priority) return <PriorityIcon priority={group.priority} size={14} />;
  if (group.kind === 'assignee') {
    return group.user ? (
      <Avatar name={group.user.name} src={group.user.image} size={20} />
    ) : (
      <UserRound className="size-4 text-muted-foreground/60" aria-hidden="true" />
    );
  }
  if (group.color) {
    return (
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
    );
  }
  return null;
}

interface Section {
  /** Unique across the list (group id, or group::subgroup). */
  key: string;
  group: IssueGroup;
  /** Set for second-level sections. */
  parent?: IssueGroup;
  /** Patch for "+" (group and subgroup combined). */
  createPatch: IssuePatch | null;
}

function SortableIssueRow({
  id,
  index,
  group,
  disabled,
  children,
}: {
  id: string;
  index: number;
  group: string;
  disabled: boolean;
  children: (ref: (element: Element | null) => void) => ReactNode;
}) {
  const { ref, isDragSource } = useSortable({ id, index, group, type: 'issue', accept: 'issue', disabled });
  return (
    <li className={cn(isDragSource && 'opacity-40')}>
      {children(ref)}
    </li>
  );
}

/** A group's rows; also a drop target so empty groups accept issues. */
function DropList({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { ref, isDropTarget } = useDroppable({
    id,
    type: 'group',
    accept: 'issue',
    // CollisionPriority.Low: rows inside win, the list catches the rest.
    collisionPriority: 1,
  });
  return (
    <ul ref={ref} className={cn(className, isDropTarget && 'rounded-md bg-accent/30')}>
      {children}
    </ul>
  );
}

export function IssueList({
  groups,
  mutations,
  selectedId,
  onSelect,
  onCreate,
}: {
  /** With `subgroups` filled when sub-grouping is on. */
  groups: IssueGroup[];
  mutations: IssueMutations;
  selectedId?: string | null;
  onSelect?: (issue: Issue) => void;
  /** Group header "+" — receives the group's patch. */
  onCreate?: (patch: IssuePatch | null) => void;
}) {
  const [{ orderBy, showEmptyGroups }] = useDisplayOptions();
  const canWrite = useProjectPermission('write');
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const sections: Section[] = groups.flatMap((group) => {
    if (!group.subgroups) return [{ key: group.id, group, createPatch: group.patch }];
    const subs = group.subgroups.filter((s) => showEmptyGroups || s.issues.length > 0);
    return [
      { key: group.id, group, createPatch: group.patch },
      ...subs.map((sub) => ({
        key: `${group.id}::${sub.id}`,
        group: sub,
        parent: group,
        createPatch: mergePatches(group.patch, sub.patch),
      })),
    ];
  });
  // Leaf sections hold the rows; a parent with subgroups only has a header.
  const leaves = sections.filter((s) => s.parent || !s.group.subgroups);
  const isHidden = (s: Section) => collapsed.has(s.parent?.id ?? '') || collapsed.has(s.key);

  const path = (s: Section) => (s.parent ? [s.parent, s.group] : [s.group]);
  const containers: SortableContainer[] = leaves.map((section) => ({
    id: section.key,
    issues: section.group.issues,
    patchFrom: (issue, fromId) => {
      const from = leaves.find((l) => l.key === fromId);
      return patchForNestedMove(issue, path(section), from ? path(from) : []);
    },
  }));
  const sortable = useSortableGroups({ containers, mutations, manual: orderBy === 'manual' });

  const flat = leaves.filter((s) => !isHidden(s)).flatMap((s) => s.group.issues);

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

  const toggleCollapsed = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderHeader = (section: Section) => {
    const { group, parent, key } = section;
    const isCollapsed = collapsed.has(key);
    const count = group.subgroups
      ? new Set(group.subgroups.flatMap((s) => s.issues.map((i) => i.id))).size
      : group.issues.length;
    return (
      <h2
        id={`group-${key}`}
        className={cn(
          'group/header sticky z-10 -mx-2 flex h-8 items-center gap-2 border-b border-border bg-background pr-4 text-xs font-medium text-muted-foreground',
          parent ? 'top-8 pl-9' : 'top-0 pl-2',
        )}
      >
        <button
          type="button"
          onClick={() => toggleCollapsed(key)}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.label}`}
          className="flex size-5 items-center justify-center rounded outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')} />
        </button>
        <GroupIcon group={group} />
        <span className="truncate text-foreground">{group.label}</span>
        <span className="tabular-nums">{count}</span>
        {onCreate && section.createPatch && canWrite && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100"
            aria-label={`New ${group.label} issue`}
            onClick={() => onCreate(section.createPatch)}
          >
            <Plus />
          </Button>
        )}
      </h2>
    );
  };

  return (
    <DragDropProvider sensors={sensors} {...sortable.handlers}>
      <div data-issue-list className="flex flex-col">
        {sections.map((section) => {
          if (section.parent && collapsed.has(section.parent.id)) return null;
          const showHeader = section.group.kind !== 'none';
          const leaf = !section.group.subgroups;
          const items = leaf ? sortable.itemsOf(section.key) : [];
          return (
            <section key={section.key} aria-labelledby={showHeader ? `group-${section.key}` : undefined}>
              {showHeader && renderHeader(section)}
              {leaf && !collapsed.has(section.key) && (
                <DropList
                  id={section.key}
                  className={cn('flex flex-col py-1', items.length === 0 && sortable.dragging && 'min-h-9')}
                >
                  {items.map(({ id, issue }, index) => (
                    <SortableIssueRow
                      key={id}
                      id={id}
                      index={index}
                      group={section.key}
                      disabled={!canWrite || isPendingIssue(issue)}
                    >
                      {(sortableRef) => (
                        <IssueRow
                          ref={(el) => {
                            sortableRef(el);
                            if (el) rowRefs.current.set(issue.id, el);
                            else rowRefs.current.delete(issue.id);
                          }}
                          issue={issue}
                          active={issue.id === selectedId}
                          statusMenuOpen={statusMenuFor === issue.id}
                          onStatusMenuOpenChange={(open) => setStatusMenuFor(open ? issue.id : null)}
                          onUpdate={(patch) => mutations.update(issue, patch)}
                          onFocus={() => setCursorId(issue.id)}
                          onSelect={onSelect ? () => onSelect(issue) : undefined}
                        />
                      )}
                    </SortableIssueRow>
                  ))}
                </DropList>
              )}
            </section>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {(source) => {
          const issue = sortable.issueOf(String(source.id));
          return issue ? (
            <div className="flex h-9 items-center gap-3 rounded-md border border-border bg-background px-2 text-sm shadow-popover">
              <StateIcon state={issue.state} size={14} />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
              <span className="truncate">{issue.title}</span>
            </div>
          ) : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}
