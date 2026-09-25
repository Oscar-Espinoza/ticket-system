'use client';

// Suggested labels / assignee / priority / likely duplicate for the selected
// triage issue, voted by its most similar past issues (heuristic, no LLM —
// src/lib/triage.ts). One click applies a suggestion; `a` applies every
// property suggestion at once. The duplicate is never part of "Apply all":
// it closes the issue, so it stays an explicit click.

import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { CopyIcon, Lightbulb, Plus } from 'lucide-react';

import { getTriageSuggestions } from '@/app/actions/triage';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, LabelChip, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { registerHotkeys } from '@/lib/hotkeys';
import { PRIORITY_LABEL, type IssuePatch, type IssueRow } from '@/lib/issue-model';
import type { SuggestionSource, TriageSuggestions as Suggestions } from '@/lib/triage';

const MAX_SOURCES = 4;

function basedOn(sources: SuggestionSource[]): string {
  const keys = sources.slice(0, MAX_SOURCES).map((s) => s.key);
  return `Based on ${keys.join(', ')}${sources.length > MAX_SOURCES ? '…' : ''}`;
}

/** Drop what the issue already has (after an apply or a manual edit). */
function openSuggestions(issue: IssueRow, s: Suggestions): Suggestions {
  const labelIds = new Set(issue.labels.map((l) => l.id));
  return {
    labels: s.labels.filter((l) => !labelIds.has(l.label.id)),
    assignee: s.assignee && s.assignee.user.id !== issue.assignee?.id ? s.assignee : null,
    priority: s.priority && s.priority.priority !== issue.priority ? s.priority : null,
    duplicate: s.duplicate,
  };
}

function propertyPatch(s: Suggestions): IssuePatch | null {
  const patch: IssuePatch = {};
  if (s.labels.length) patch.addLabelIds = s.labels.map((l) => l.label.id);
  if (s.assignee) patch.assigneeId = s.assignee.user.id;
  if (s.priority) patch.priority = s.priority.priority;
  return Object.keys(patch).length ? patch : null;
}

function Chip({
  hint,
  onClick,
  disabled,
  label,
  children,
}: {
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-full border border-border px-2 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

export function TriageSuggestions({
  issue,
  mutations,
  pending,
  onDuplicate,
}: {
  /** The selected triage issue (live, optimistic copy). */
  issue: IssueRow;
  mutations: IssueMutations;
  pending: boolean;
  onDuplicate: (original: SuggestionSource) => void;
}) {
  // Per-issue cache so j/k through the queue doesn't refetch.
  const [cache, setCache] = useState<ReadonlyMap<string, Suggestions>>(() => new Map());
  const { projectId, id } = issue;
  const loaded = cache.has(id);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    getTriageSuggestions({ projectId, id })
      .then((result) => {
        if (cancelled || !result.ok) return;
        setCache((prev) => new Map(prev).set(id, result.suggestions));
      })
      .catch(() => {
        // Advisory: no strip on failure.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, id, loaded]);

  const cached = cache.get(id);
  const open = cached ? openSuggestions(issue, cached) : null;
  const patch = open ? propertyPatch(open) : null;

  const applyAll = () => {
    if (patch && !pending) mutations.update(issue, patch);
  };
  const onApplyAllKey = useEffectEvent(applyAll);

  const canApplyAll = patch !== null;
  useEffect(() => {
    if (!canApplyAll) return;
    return registerHotkeys([
      {
        key: 'a',
        scope: 'Triage',
        description: 'Apply suggestions',
        when: (event) => !event.shiftKey,
        handler: () => onApplyAllKey(),
      },
    ]);
  }, [canApplyAll]);

  if (!open || (!patch && !open.duplicate)) return null;

  const sources = new Map<string, SuggestionSource>();
  for (const s of [...open.labels, open.assignee, open.priority, open.duplicate]) {
    for (const src of s?.basedOn ?? []) sources.set(src.id, src);
  }
  const pct = (confidence: number) => `${Math.round(confidence * 100)}%`;

  return (
    <div
      role="group"
      aria-label={`Suggestions for ${issue.key}`}
      className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5"
    >
      <span className="flex items-center gap-1.5 pr-1 text-xs text-muted-foreground">
        <Lightbulb className="size-3.5" />
        Suggested
      </span>

      {open.labels.map((s) => (
        <Chip
          key={s.label.id}
          label={`Add label ${s.label.name}`}
          hint={`${basedOn(s.basedOn)} · ${pct(s.confidence)} of similar issues`}
          disabled={pending}
          onClick={() => mutations.update(issue, { addLabelIds: [s.label.id] })}
        >
          <Plus className="size-3 text-muted-foreground" />
          <LabelChip dotColor={s.label.color} className="border-0 bg-transparent p-0">
            <span className="truncate">{s.label.name}</span>
          </LabelChip>
        </Chip>
      ))}

      {open.assignee && (
        <Chip
          label={`Assign to ${open.assignee.user.name}`}
          hint={`${basedOn(open.assignee.basedOn)} · ${pct(open.assignee.confidence)} of similar issues`}
          disabled={pending}
          onClick={() => mutations.update(issue, { assigneeId: open.assignee!.user.id })}
        >
          <Avatar name={open.assignee.user.name} src={open.assignee.user.image} size={20} className="size-4" />
          <span className="truncate">{open.assignee.user.name}</span>
        </Chip>
      )}

      {open.priority && (
        <Chip
          label={`Set priority to ${PRIORITY_LABEL[open.priority.priority]}`}
          hint={`${basedOn(open.priority.basedOn)} · ${pct(open.priority.confidence)} of similar issues`}
          disabled={pending}
          onClick={() => mutations.update(issue, { priority: open.priority!.priority })}
        >
          <PriorityIcon priority={open.priority.priority} size={14} />
          {PRIORITY_LABEL[open.priority.priority]}
        </Chip>
      )}

      {open.duplicate && (
        <Chip
          label={`Mark as duplicate of ${open.duplicate.issue.key}`}
          hint={`${open.duplicate.issue.title} · ${pct(open.duplicate.confidence)} match`}
          disabled={pending}
          onClick={() => onDuplicate(open.duplicate!.issue)}
        >
          <CopyIcon className="size-3 text-muted-foreground" />
          Duplicate of
          <StateIcon state={open.duplicate.issue.state} size={14} />
          <span className="font-mono">{open.duplicate.issue.key}</span>
        </Chip>
      )}

      <span className="hidden truncate text-xs text-muted-foreground md:inline">
        {basedOn([...sources.values()])}
      </span>

      {patch && (
        <Button size="xs" variant="ghost" className="ml-auto" disabled={pending} onClick={applyAll}>
          Apply all
          <kbd className="ml-1 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
            A
          </kbd>
        </Button>
      )}
    </div>
  );
}
