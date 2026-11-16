<!--
  Suggested labels / assignee / priority / likely duplicate for the selected
  triage issue, voted by its most similar past issues (heuristic, no LLM —
  src/lib/triage.ts). One click applies a suggestion; `a` applies every
  property suggestion at once. The duplicate is never part of "Apply all":
  it closes the issue, so it stays an explicit click.
-->
<script module lang="ts">
  import { m } from '@/lib/i18n';
  import type { IssuePatch, IssueRow } from '@/lib/issue-model';
  import type { SuggestionSource, TriageSuggestions as Suggestions } from '@/lib/triage';

  const MAX_SOURCES = 4;

  function basedOn(sources: SuggestionSource[]): string {
    const keys = sources.slice(0, MAX_SOURCES).map((s) => s.key);
    return sources.length > MAX_SOURCES
      ? m.issues_triage_based_on_more({ keys: keys.join(', ') })
      : m.issues_triage_based_on({ keys: keys.join(', ') });
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

  const pct = (confidence: number) => `${Math.round(confidence * 100)}%`;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import Plus from '@lucide/svelte/icons/plus';

  import { getTriageSuggestions } from '@/lib/actions/triage';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/components/ui/tooltip';
  import { Avatar, LabelChip, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { PRIORITY_LABEL } from '@/lib/issue-model';

  let {
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
  } = $props();

  // Per-issue cache so j/k through the queue doesn't refetch.
  let cache = $state.raw<ReadonlyMap<string, Suggestions>>(new Map());
  // Primitive deps, (projectId, id, loaded): optimistic edits make a
  // new issue object but must not restart the fetch.
  const projectId = $derived(issue.projectId);
  const id = $derived(issue.id);
  const loaded = $derived(cache.has(id));

  $effect(() => {
    if (loaded) return;
    const issueId = id;
    let cancelled = false;
    getTriageSuggestions({ projectId, id: issueId })
      .then((result) => {
        if (cancelled || !result.ok) return;
        cache = new Map(cache).set(issueId, result.suggestions);
      })
      .catch(() => {
        // Advisory: no strip on failure.
      });
    return () => {
      cancelled = true;
    };
  });

  const cached = $derived(cache.get(issue.id));
  const open = $derived(cached ? openSuggestions(issue, cached) : null);
  const patch = $derived(open ? propertyPatch(open) : null);

  function applyAll() {
    if (patch && !pending) mutations.update(issue, patch);
  }

  const canApplyAll = $derived(patch !== null);
  $effect(() => {
    if (!canApplyAll) return;
    return registerHotkeys([
      {
        key: 'a',
        scope: m.issues_triage_scope(),
        description: m.issues_triage_apply_suggestions(),
        when: (event) => !event.shiftKey,
        handler: () => applyAll(),
      },
    ]);
  });

  const sources = $derived.by(() => {
    const map = new Map<string, SuggestionSource>();
    if (!open) return map;
    for (const s of [...open.labels, open.assignee, open.priority, open.duplicate]) {
      for (const src of s?.basedOn ?? []) map.set(src.id, src);
    }
    return map;
  });
</script>

{#snippet chip(hint: string, onClick: () => void, label: string, content: Snippet)}
  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          onclick={onClick}
          disabled={pending}
          aria-label={label}
          class="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-full border border-border px-2 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {@render content()}
        </button>
      {/snippet}
    </TooltipTrigger>
    <TooltipContent>{hint}</TooltipContent>
  </Tooltip>
{/snippet}

{#if open && (patch || open.duplicate)}
  <div
    role="group"
    aria-label={m.issues_triage_suggestions_for({ key: issue.key })}
    class="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5"
  >
    <span class="flex items-center gap-1.5 pr-1 text-xs text-muted-foreground">
      <Lightbulb class="size-3.5" />
      {m.issues_triage_suggested()}
    </span>

    {#each open.labels as s (s.label.id)}
      {#snippet labelContent()}
        <Plus class="size-3 text-muted-foreground" />
        <LabelChip dotColor={s.label.color} class="border-0 bg-transparent p-0">
          <span class="truncate">{s.label.name}</span>
        </LabelChip>
      {/snippet}
      {@render chip(
        m.issues_triage_hint_similar({ basedOn: basedOn(s.basedOn), pct: pct(s.confidence) }),
        () => mutations.update(issue, { addLabelIds: [s.label.id] }),
        m.issues_triage_add_label({ name: s.label.name }),
        labelContent,
      )}
    {/each}

    {#if open.assignee}
      {@const assignee = open.assignee}
      {#snippet assigneeContent()}
        <Avatar name={assignee.user.name} src={assignee.user.image} size={20} class="size-4" />
        <span class="truncate">{assignee.user.name}</span>
      {/snippet}
      {@render chip(
        m.issues_triage_hint_similar({ basedOn: basedOn(assignee.basedOn), pct: pct(assignee.confidence) }),
        () => mutations.update(issue, { assigneeId: assignee.user.id }),
        m.issues_triage_assign_to({ name: assignee.user.name }),
        assigneeContent,
      )}
    {/if}

    {#if open.priority}
      {@const suggested = open.priority}
      {#snippet priorityContent()}
        <PriorityIcon priority={suggested.priority} size={14} />
        {PRIORITY_LABEL[suggested.priority]}
      {/snippet}
      {@render chip(
        m.issues_triage_hint_similar({ basedOn: basedOn(suggested.basedOn), pct: pct(suggested.confidence) }),
        () => mutations.update(issue, { priority: suggested.priority }),
        m.issues_triage_set_priority_to({ priority: PRIORITY_LABEL[suggested.priority] }),
        priorityContent,
      )}
    {/if}

    {#if open.duplicate}
      {@const duplicate = open.duplicate}
      {#snippet duplicateContent()}
        <CopyIcon class="size-3 text-muted-foreground" />
        {m.issues_triage_duplicate_of()}
        <StateIcon state={duplicate.issue.state} size={14} />
        <span class="font-mono">{duplicate.issue.key}</span>
      {/snippet}
      {@render chip(
        m.issues_triage_dup_hint({ title: duplicate.issue.title, pct: pct(duplicate.confidence) }),
        () => onDuplicate(duplicate.issue),
        m.issues_triage_mark_dup_of({ key: duplicate.issue.key }),
        duplicateContent,
      )}
    {/if}

    <span class="hidden truncate text-xs text-muted-foreground md:inline">
      {basedOn([...sources.values()])}
    </span>

    {#if patch}
      <Button size="xs" variant="ghost" class="ml-auto" disabled={pending} onclick={applyAll}>
        {m.issues_triage_apply_all()}
        <kbd class="ml-1 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">A</kbd>
      </Button>
    {/if}
  </div>
{/if}
