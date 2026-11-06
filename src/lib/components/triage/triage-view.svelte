<!--
  Triage inbox: issues in a triage state (newest first) with the issue preview.
  Keyboard: j/k (↑/↓) move, 1 accept, 2 duplicate, 3 decline, a apply suggestions.
-->
<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Copy from '@lucide/svelte/icons/copy';
  import InboxIcon from '@lucide/svelte/icons/inbox';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import { toast } from 'svelte-sonner';

  import {
    acceptTriageIssue,
    declineTriageIssue,
    markTriageDuplicate,
    type TriageActionResult,
  } from '@/lib/actions/triage';
  import { actionErrorText } from '@/lib/action-errors';
  import IssueDetailPane from '@/lib/components/issue-detail/issue-detail-pane.svelte';
  import { useIsDesktop } from '@/lib/components/issue-detail/use-is-desktop.svelte';
  import LabelChips from '@/lib/components/issues/label-chips.svelte';
  import { relativeTime } from '@/lib/relative-time';
  import { useIssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { afterFrame } from '@/lib/svelte/focus';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import AcceptDialog, { type AcceptChoice } from './accept-dialog.svelte';
  import DeclineDialog from './decline-dialog.svelte';
  import DuplicateDialog from './duplicate-dialog.svelte';
  import TriageSuggestions from './triage-suggestions.svelte';

  type DialogKind = 'accept' | 'decline' | 'duplicate' | null;

  const isTriage = (issue: IssueRow) =>
    !issue.archivedAt && !issue.deletedAt && issue.state.type === 'triage';

  let {
    issues,
    candidates,
  }: {
    /** Triage issues, newest first. */
    issues: IssueRow[];
    /** Every active issue of the project (duplicate search). */
    candidates: IssueRow[];
  } = $props();

  const canWrite = useProjectPermission('write');
  const isDesktop = useIsDesktop();
  const desktop = $derived(isDesktop.current);
  const mutations = useIssueMutations(() => issues, { include: isTriage });
  // Issues handled here disappear at once; the refreshed props confirm it.
  let handled = $state.raw<ReadonlySet<string>>(new Set());
  const list = $derived(mutations.issues.filter((issue) => !handled.has(issue.id)));
  // undefined = default (first issue on desktop), null = preview closed.
  let selectedId = $state<string | null | undefined>(undefined);
  let dialog = $state<DialogKind>(null);
  let running = $state(0);
  const pending = $derived(running > 0);

  // Desktop previews the first issue by default; mobile opens a sheet on tap.
  const selected = $derived.by(() => {
    const explicit = selectedId ? list.find((issue) => issue.id === selectedId) : undefined;
    return explicit ?? (selectedId !== null && desktop ? (list[0] ?? null) : null);
  });
  const index = $derived(selected ? list.indexOf(selected) : -1);

  const focusRow = (id: string) =>
    afterFrame(() => document.querySelector<HTMLElement>(`[data-triage-row="${id}"]`)?.focus());
  function select(issue: IssueRow | undefined) {
    if (!issue) return;
    selectedId = issue.id;
    focusRow(issue.id);
  }

  async function run(issue: IssueRow, action: () => Promise<TriageActionResult>, success: string) {
    const next = list[index + 1] ?? list[index - 1];
    running += 1;
    try {
      let result: TriageActionResult;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: 'Something went wrong — nothing was changed.' };
      }
      if (!result.ok) {
        toast.error(actionErrorText(result.error, "You don't have permission to triage."));
        return;
      }
      dialog = null;
      handled = new Set(handled).add(issue.id);
      if (result.warning) toast.warning(result.warning);
      else toast.success(success);
      if (next) select(next);
      else selectedId = undefined;
    } finally {
      running -= 1;
    }
  }

  const accept = (issue: IssueRow, choice: AcceptChoice) =>
    run(
      issue,
      () =>
        acceptTriageIssue({
          projectId: issue.projectId,
          id: issue.id,
          stateId: choice.stateId,
          priority: choice.priority,
          assigneeId: choice.assigneeId,
        }),
      `Accepted ${issue.key}`,
    );
  const decline = (issue: IssueRow, reason: string) =>
    run(
      issue,
      () => declineTriageIssue({ projectId: issue.projectId, id: issue.id, reason }),
      `Declined ${issue.key}`,
    );
  const duplicate = (issue: IssueRow, original: { id: string; key: string }) =>
    run(
      issue,
      () => markTriageDuplicate({ projectId: issue.projectId, id: issue.id, originalId: original.id }),
      `Marked ${issue.key} as a duplicate of ${original.key}`,
    );

  // Reads the latest state when a key fires (useEffectEvent).
  function onKey(key: string) {
    if (key === 'j') select(list[Math.min(list.length - 1, index + 1)] ?? list[0]);
    else if (key === 'k') select(list[Math.max(0, index - 1)]);
    else if (selected && canWrite.current && !pending) {
      if (key === '1') dialog = 'accept';
      else if (key === '2') dialog = 'duplicate';
      else if (key === '3') dialog = 'decline';
    }
  }
  const hasIssues = $derived(list.length > 0);

  $effect(() => {
    if (!hasIssues) return;
    const key = (k: string, description: string) => ({
      key: k,
      scope: 'Triage',
      description,
      handler: () => onKey(k),
    });
    return registerHotkeys([
      key('j', 'Next issue'),
      key('k', 'Previous issue'),
      key('1', 'Accept'),
      key('2', 'Mark as duplicate'),
      key('3', 'Decline'),
    ]);
  });

  function rowKeydown(event: KeyboardEvent, issue: IssueRow) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectedId = issue.id;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const i = list.indexOf(issue) + (event.key === 'ArrowDown' ? 1 : -1);
      select(list[Math.max(0, Math.min(list.length - 1, i))]);
    }
  }
</script>

{#snippet kbd(text: string)}
  <kbd class="ml-1 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">{text}</kbd>
{/snippet}

{#snippet inboxIcon()}<InboxIcon />{/snippet}

{#if !hasIssues}
  <EmptyState
    icon={inboxIcon}
    title="Triage is clear"
    description="New issues from the intake form, the API and people outside the project land here for review."
  />
{:else}
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <p class="text-sm text-muted-foreground">
        {list.length} {list.length === 1 ? 'issue' : 'issues'} to triage
      </p>
      {#if canWrite.current && selected}
        <div class="ml-auto flex items-center gap-1.5" aria-label="Triage {selected.key}" role="group">
          <Button size="sm" onclick={() => (dialog = 'accept')} disabled={pending}>
            <CircleCheck />
            Accept
            {@render kbd('1')}
          </Button>
          <Button size="sm" variant="outline" onclick={() => (dialog = 'duplicate')} disabled={pending}>
            <Copy />
            Duplicate
            {@render kbd('2')}
          </Button>
          <Button size="sm" variant="outline" onclick={() => (dialog = 'decline')} disabled={pending}>
            <CircleX />
            Decline
            {@render kbd('3')}
          </Button>
        </div>
      {/if}
    </div>

    {#if canWrite.current && selected}
      {@const current = selected}
      <TriageSuggestions
        issue={current}
        {mutations}
        {pending}
        onDuplicate={(original) => void duplicate(current, original)}
      />
    {/if}

    <div class="flex min-h-0 flex-1">
      <ul aria-label="Triage issues" class="flex min-w-0 flex-1 flex-col self-start">
        {#each list as issue (issue.id)}
          <li>
            <div
              role="button"
              tabindex={0}
              data-triage-row={issue.id}
              aria-current={issue.id === selected?.id ? 'true' : undefined}
              aria-label="{issue.key} {issue.title}"
              onclick={() => (selectedId = issue.id)}
              onkeydown={(e) => rowKeydown(e, issue)}
              class={cn(
                'flex h-10 cursor-default items-center gap-3 rounded-md px-2 text-sm outline-none',
                'hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
                issue.id === selected?.id && 'bg-muted',
              )}
            >
              <PriorityIcon priority={issue.priority} size={14} />
              <span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
              <StateIcon state={issue.state} size={14} />
              <span class="min-w-0 flex-1 truncate">{issue.title}</span>
              <LabelChips labels={issue.labels} max={2} class="hidden md:flex" />
              {#if issue.creator}
                <Avatar name={issue.creator.name} src={issue.creator.image} size={20} />
              {:else}
                <span class="text-xs text-muted-foreground">External</span>
              {/if}
              <span class="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {relativeTime(issue.createdAt)}
              </span>
            </div>
          </li>
        {/each}
      </ul>
      {#if selected}
        {@const current = selected}
        <IssueDetailPane
          issue={current}
          {mutations}
          onClose={() => {
            selectedId = null;
            if (desktop) focusRow(current.id);
          }}
        />
      {/if}
    </div>

    {#if selected && canWrite.current}
      {@const current = selected}
      <AcceptDialog
        issue={current}
        bind:open={() => dialog === 'accept', (open) => (dialog = open ? 'accept' : null)}
        {pending}
        onAccept={(choice) => void accept(current, choice)}
      />
      {#key current.id}
        <DeclineDialog
          issue={current}
          bind:open={() => dialog === 'decline', (open) => (dialog = open ? 'decline' : null)}
          {pending}
          onDecline={(reason) => void decline(current, reason)}
        />
      {/key}
      <DuplicateDialog
        issue={current}
        candidates={candidates.filter((c) => c.id !== current.id)}
        bind:open={() => dialog === 'duplicate', (open) => (dialog = open ? 'duplicate' : null)}
        onPick={(original) => void duplicate(current, original)}
      />
    {/if}
  </div>
{/if}
