'use client';

// Epic dependencies on the epic Overview: "Blocked by" / "Blocking" /
// "Related" groups, a two-step picker (kind → epic) to add one, and remove
// buttons. Conflicts (the blocked epic starts before its blocker's target
// date) are flagged inline, like the roadmap does.

import { useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Ban, Link2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { addEpicRelation, removeEpicRelation } from '@/app/actions/epic-relations';
import { PickerPopover, keywordFilter } from '@/components/issue-pickers';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { formatDueDate } from '@/lib/dates';
import { EpicIcon, EpicStatusIcon } from './epic-glyphs';
import {
  EPIC_RELATION_KINDS,
  EPIC_RELATION_LABEL,
  epicPath,
  isScheduleConflict,
  type EpicRelationKind,
  type EpicRelationRow,
  type EpicStatus,
} from './epic-model';

const KIND_ICON: Record<EpicRelationKind, typeof Ban> = {
  blocked_by: Ban,
  blocks: AlertTriangle,
  related: Link2,
};

const KIND_PROMPT: Record<EpicRelationKind, string> = {
  blocked_by: 'Blocked by…',
  blocks: 'Blocking…',
  related: 'Related to…',
};

export interface DependencyCandidate {
  id: string;
  name: string;
  color: string | null;
  status: EpicStatus;
}

export function EpicDependencies({
  projectId,
  epic,
  relations: serverRelations,
  candidates,
  canWrite,
}: {
  projectId: string;
  epic: { id: string; startDate: string | null; targetDate: string | null };
  relations: EpicRelationRow[];
  /** The project's non-archived epics. */
  candidates: DependencyCandidate[];
  canWrite: boolean;
}) {
  const [relations, removeOptimistic] = useOptimistic(serverRelations, (list, id: string) =>
    list.filter((r) => r.id !== id),
  );
  const [pending, startTransition] = useTransition();

  const remove = (relation: EpicRelationRow) =>
    startTransition(async () => {
      removeOptimistic(relation.id);
      const result = await removeEpicRelation({ projectId, id: relation.id });
      if (!result.ok) toast.error(result.error);
    });

  const add = (kind: EpicRelationKind, otherEpicId: string) =>
    startTransition(async () => {
      const result = await addEpicRelation({ projectId, epicId: epic.id, otherEpicId, kind });
      if (!result.ok) toast.error(result.error);
    });

  const linked = new Set(relations.map((r) => r.epic.id));
  const available = candidates.filter((c) => c.id !== epic.id && !linked.has(c.id));

  return (
    <section aria-labelledby="dependencies-heading" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 id="dependencies-heading" className="text-sm font-medium">
          Dependencies
        </h2>
        {canWrite && (
          <AddDependency candidates={available} disabled={pending} onAdd={add}>
            <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground">
              <Plus />
              Add dependency
            </Button>
          </AddDependency>
        )}
      </div>

      {relations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No dependencies. Mark epics this one is blocked by or blocking to see them on the roadmap.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {EPIC_RELATION_KINDS.map((kind) => {
            const group = relations.filter((r) => r.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind} className="flex flex-col">
                <h3 className="mb-1 text-xs text-muted-foreground">
                  {EPIC_RELATION_LABEL[kind]} · {group.length}
                </h3>
                <ul className="flex flex-col rounded-md border border-border">
                  {group.map((relation) => {
                    const conflict =
                      (kind === 'blocked_by' && isScheduleConflict(relation.epic, epic)) ||
                      (kind === 'blocks' && isScheduleConflict(epic, relation.epic));
                    return (
                      <li
                        key={relation.id}
                        className="group flex h-9 items-center gap-2 border-b border-border px-3 text-sm last:border-b-0"
                      >
                        <Link
                          href={epicPath(relation.epic.projectId, relation.epic.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 outline-none hover:underline focus-visible:underline"
                        >
                          <EpicIcon color={relation.epic.color} />
                          <span className="truncate">{relation.epic.name}</span>
                          {relation.epic.archivedAt && (
                            <span className="shrink-0 text-xs text-muted-foreground">Archived</span>
                          )}
                        </Link>
                        {conflict && (
                          <span
                            className="flex shrink-0 items-center gap-1 text-xs text-destructive"
                            title={
                              kind === 'blocked_by'
                                ? 'This epic starts before its blocker’s target date.'
                                : 'The blocked epic starts before this epic’s target date.'
                            }
                          >
                            <AlertTriangle className="size-3.5" />
                            <span className="hidden sm:inline">Schedule conflict</span>
                          </span>
                        )}
                        {relation.epic.targetDate && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDueDate(relation.epic.targetDate)}
                          </span>
                        )}
                        <EpicStatusIcon status={relation.epic.status} />
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Remove dependency on ${relation.epic.name}`}
                            className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => remove(relation)}
                          >
                            <X />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AddDependency({
  candidates,
  disabled,
  onAdd,
  children,
}: {
  candidates: DependencyCandidate[];
  disabled: boolean;
  onAdd: (kind: EpicRelationKind, epicId: string) => void;
  children: React.ReactNode;
}) {
  const [kind, setKind] = useState<EpicRelationKind | null>(null);
  return (
    <PickerPopover
      align="end"
      className="w-64"
      onOpenChange={(open) => !open && setKind(null)}
      content={(close) =>
        kind === null ? (
          <Command filter={keywordFilter} key="kind">
            <CommandInput placeholder="Add dependency…" />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              {EPIC_RELATION_KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <CommandItem key={k} value={k} keywords={[KIND_PROMPT[k]]} onSelect={() => setKind(k)}>
                    <Icon className="text-muted-foreground" />
                    {KIND_PROMPT[k]}
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        ) : (
          <Command filter={keywordFilter} key="epic">
            <CommandInput
              autoFocus
              placeholder={KIND_PROMPT[kind]}
              onKeyDown={(e) => {
                // Backspace on an empty search steps back to the kind list.
                if (e.key === 'Backspace' && !e.currentTarget.value) setKind(null);
              }}
            />
            <CommandList>
              <CommandEmpty>No other epics to link.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__back" keywords={['Back']} onSelect={() => setKind(null)}>
                  <ArrowLeft className="text-muted-foreground" />
                  <span className="text-muted-foreground">{EPIC_RELATION_LABEL[kind]}</span>
                </CommandItem>
                {candidates.map((epic) => (
                  <CommandItem
                    key={epic.id}
                    value={epic.id}
                    keywords={[epic.name]}
                    disabled={disabled}
                    onSelect={() => {
                      close();
                      onAdd(kind, epic.id);
                    }}
                  >
                    <EpicIcon color={epic.color} />
                    <span className="flex-1 truncate">{epic.name}</span>
                    <EpicStatusIcon status={epic.status} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )
      }
    >
      {children}
    </PickerPopover>
  );
}
