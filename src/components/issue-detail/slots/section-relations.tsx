'use client';

// Owner: B4. Blocks / blocked by / related / duplicate. Relations aren't part
// of IssueRow, so they're fetched per issue; adds/removes apply locally first
// and then resync from the server.

import { useEffect, useState, useTransition, type ComponentType } from 'react';
import { ArrowLeftRight, ChevronLeft, CopyIcon, Flag, Plus } from 'lucide-react';
import { toast } from 'sonner';

import {
  addIssueRelation,
  getIssueRelations,
  removeIssueRelation,
} from '@/app/actions/relations';
import { IssueRefRow, SectionHeader } from '@/components/issue-hierarchy/issue-ref-row';
import { IssueSearchOptions } from '@/components/issue-hierarchy/issue-search-picker';
import { PickerPopover } from '@/components/issue-pickers/picker-popover';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import type { IssueRow } from '@/lib/issue-model';
import type {
  AddableRelationKind,
  IssueRelationView,
  RelationKind,
} from '@/lib/relations';
import { cn } from '@/lib/utils';

const KINDS: Record<
  RelationKind,
  { group: string; add?: string; icon: ComponentType<{ className?: string }>; iconClass: string }
> = {
  blocked_by: { group: 'Blocked by', add: 'Blocked by…', icon: Flag, iconClass: 'text-red-500' },
  blocks: { group: 'Blocking', add: 'Blocking…', icon: Flag, iconClass: 'text-orange-500' },
  related: { group: 'Related', add: 'Related to…', icon: ArrowLeftRight, iconClass: 'text-muted-foreground' },
  duplicate_of: { group: 'Duplicate of', add: 'Mark as duplicate of…', icon: CopyIcon, iconClass: 'text-muted-foreground' },
  duplicated_by: { group: 'Duplicated by', icon: CopyIcon, iconClass: 'text-muted-foreground' },
};
const GROUP_ORDER: RelationKind[] = ['blocked_by', 'blocks', 'related', 'duplicate_of', 'duplicated_by'];
const ADD_ORDER: AddableRelationKind[] = ['blocked_by', 'blocks', 'related', 'duplicate_of'];

/** Kinds that share a stored row type — an issue already linked that way is excluded. */
const SAME_STORED: Record<AddableRelationKind, RelationKind[]> = {
  blocks: ['blocks', 'blocked_by'],
  blocked_by: ['blocks', 'blocked_by'],
  related: ['related'],
  duplicate_of: ['duplicate_of', 'duplicated_by'],
};

function errorMessage(error: string) {
  return error === 'Forbidden' ? "You don't have permission to do that in this project." : error;
}

export function SectionRelations({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const canWrite = useProjectPermission('write');
  const [relations, setRelations] = useState<IssueRelationView[] | null>(null);
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  // Relations added elsewhere (e.g. "Mark as duplicate" in Similar issues)
  // bump the issue's updatedAt; refetch when it changes.
  const updatedStamp = new Date(issue.updatedAt).getTime();

  useEffect(() => {
    let cancelled = false;
    getIssueRelations({ projectId: issue.projectId, ticketId: issue.id })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRelations(result.relations);
        else setRelations([]);
      })
      .catch(() => {
        if (!cancelled) setRelations((current) => current ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [issue.projectId, issue.id, version, updatedStamp]);

  const resync = () => setVersion((v) => v + 1);

  const add = (kind: AddableRelationKind, other: IssueRow) => {
    setRelations((current) => [...(current ?? []), { id: `temp-${other.id}`, kind, issue: other }]);
    startTransition(async () => {
      try {
        const result = await addIssueRelation({
          projectId: issue.projectId,
          ticketId: issue.id,
          relatedTicketId: other.id,
          kind,
        });
        if (!result.ok) toast.error(errorMessage(result.error));
        else if (result.warning) toast.warning(result.warning);
        else if (kind === 'duplicate_of') toast.success(`Marked ${issue.key} as a duplicate of ${other.key}`);
      } catch {
        toast.error('Something went wrong — the relation was not saved.');
      }
      resync();
    });
  };

  const remove = (relation: IssueRelationView) => {
    setRelations((current) => current?.filter((r) => r.id !== relation.id) ?? null);
    startTransition(async () => {
      try {
        const result = await removeIssueRelation({ projectId: issue.projectId, relationId: relation.id });
        if (!result.ok) toast.error(errorMessage(result.error));
      } catch {
        toast.error('Something went wrong — the relation was not removed.');
      }
      resync();
    });
  };

  const list = relations ?? [];
  if (list.length === 0 && !canWrite) return null;

  // The list's copy of a related issue is fresher (optimistic state changes).
  const fresh = (other: IssueRow) => mutations.issues.find((i) => i.id === other.id) ?? other;

  return (
    <section aria-label="Relations" className="flex flex-col gap-1">
      <SectionHeader title="Relations">
        {canWrite && (
          <PickerPopover
            open={adding}
            onOpenChange={setAdding}
            align="end"
            className="w-80"
            content={(close) => (
              <AddRelation
                issue={issue}
                candidates={mutations.issues}
                relations={list}
                onAdd={(kind, other) => {
                  close();
                  add(kind, other);
                }}
              />
            )}
          >
            <Button variant="ghost" size="icon-xs" aria-label="Add relation" title="Add relation">
              <Plus />
            </Button>
          </PickerPopover>
        )}
      </SectionHeader>

      {GROUP_ORDER.map((kind) => {
        const group = list.filter((r) => r.kind === kind);
        if (group.length === 0) return null;
        const { group: label, icon: Icon, iconClass } = KINDS[kind];
        return (
          <div key={kind} className="flex flex-col">
            <div className="flex items-center gap-1.5 px-1.5 pt-1 text-xs text-muted-foreground">
              <Icon className={cn('size-3', iconClass)} />
              {label}
            </div>
            {group.map((relation) => (
              <IssueRefRow
                key={relation.id}
                issue={fresh(relation.issue)}
                removeLabel="Remove relation"
                className={relation.id.startsWith('temp-') ? 'opacity-60' : undefined}
                onRemove={
                  canWrite && !relation.id.startsWith('temp-') ? () => remove(relation) : undefined
                }
              />
            ))}
          </div>
        );
      })}

      {canWrite && relations !== null && list.length === 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-2 font-normal text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus />
          Add relation
        </Button>
      )}
    </section>
  );
}

/** Two steps in one popover: relation type, then the other issue. */
function AddRelation({
  issue,
  candidates,
  relations,
  onAdd,
}: {
  issue: IssueRow;
  candidates: IssueRow[];
  relations: IssueRelationView[];
  onAdd: (kind: AddableRelationKind, other: IssueRow) => void;
}) {
  const [kind, setKind] = useState<AddableRelationKind | null>(null);

  if (!kind) {
    return (
      <Command>
        <CommandList>
          {ADD_ORDER.map((k) => {
            const { add: label, icon: Icon, iconClass } = KINDS[k];
            return (
              <CommandItem key={k} value={k} onSelect={() => setKind(k)}>
                <Icon className={iconClass} />
                {label}
              </CommandItem>
            );
          })}
        </CommandList>
      </Command>
    );
  }

  const exclude = [
    issue.id,
    ...relations.filter((r) => SAME_STORED[kind].includes(r.kind)).map((r) => r.issue.id),
  ];
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setKind(null)}
        className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        {KINDS[kind].add}
      </button>
      <IssueSearchOptions
        issues={candidates}
        exclude={exclude}
        placeholder="Search issues…"
        onSelect={(other) => onAdd(kind, other)}
      />
    </div>
  );
}
