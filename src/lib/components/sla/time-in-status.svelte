<!--
  "3d 4h · since Mar 4" for the issue's current state; hovering (or focusing)
  loads how long the issue spent in every state from its activity history.
  Port of src/components/sla/time-in-status.tsx (same props: issue, now).
-->
<script lang="ts">
  import { getTimeInStatus } from '@/lib/actions/sla';
  import { useOptionalProjectData } from '@/lib/components/project/project-data.svelte';
  import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/lib/components/ui/hover-card';
  import { Skeleton, StatusIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import { formatDuration, type TimeInState } from '@/lib/sla';

  let { issue, now }: { issue: IssueRow; now: number | null } = $props();

  const dayFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

  /**
   * When the issue entered its current state. Issues from before
   * `stateChangedAt` existed fall back to the matching transition timestamp.
   */
  function stateSince(issue: IssueRow): Date {
    if (issue.stateChangedAt) return issue.stateChangedAt;
    const byType = { started: issue.startedAt, completed: issue.completedAt, canceled: issue.canceledAt };
    return byType[issue.state.type as keyof typeof byType] ?? issue.createdAt;
  }

  type History = { key: string; states: TimeInState[] | null; error?: string };

  const data = useOptionalProjectData();
  const since = $derived(new Date(stateSince(issue)));
  // Refetch when the state (or the issue) changes.
  const key = $derived(`${issue.id}:${issue.stateId}:${since.getTime()}`);
  let history = $state.raw<History | null>(null);
  const loaded = $derived(history?.key === key ? history : null);

  const load = (open: boolean) => {
    if (!open || loaded) return;
    const k = key;
    history = { key: k, states: null };
    void getTimeInStatus({ projectId: issue.projectId, issueId: issue.id })
      .then((result) => {
        history = result.ok
          ? { key: k, states: result.states }
          : { key: k, states: [], error: "Couldn't load the history." };
      })
      .catch(() => {
        history = { key: k, states: [], error: "Couldn't load the history." };
      });
  };

  const colorOf = (id: string) => data?.states.find((s) => s.id === id)?.color;
  const longest = $derived(Math.max(1, ...(loaded?.states ?? []).map((s) => s.ms)));
</script>

<HoverCard openDelay={250} closeDelay={100} onOpenChange={load}>
  <HoverCardTrigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="-ml-1 rounded px-1 py-0.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={now === null
          ? `In ${issue.state.name} since ${dayFormat.format(since)}`
          : `In ${issue.state.name} for ${formatDuration(now - since.getTime())}, since ${dayFormat.format(since)}. Hover for time in each status.`}
      >
        <span class="tabular-nums">{now === null ? '—' : formatDuration(now - since.getTime())}</span><span
          class="text-muted-foreground">{' '}· since {dayFormat.format(since)}</span
        >
      </button>
    {/snippet}
  </HoverCardTrigger>
  <HoverCardContent align="start" class="w-72">
    <p class="mb-2 text-xs font-medium text-muted-foreground">Time in status</p>
    {#if !loaded || loaded.states === null}
      <div class="flex flex-col gap-1.5">
        <Skeleton class="h-5" />
        <Skeleton class="h-5" />
      </div>
    {:else if loaded.error}
      <p class="text-xs text-muted-foreground">{loaded.error}</p>
    {:else}
      <ul class="flex flex-col gap-1.5">
        {#each loaded.states as state (state.id)}
          <li class="flex flex-col gap-1">
            <div class="flex items-center gap-2 text-xs">
              <StatusIcon type={state.type} color={colorOf(state.id)} size={14} />
              <span class="min-w-0 flex-1 truncate">
                {state.name}
                {#if state.current}<span class="text-muted-foreground"> · now</span>{/if}
              </span>
              <span class="shrink-0 tabular-nums text-muted-foreground">
                {formatDuration(state.ms)}
              </span>
            </div>
            <span aria-hidden="true" class="h-1 overflow-hidden rounded-full bg-muted">
              <span
                class="block h-full rounded-full bg-muted-foreground/50"
                style:width="{Math.max(2, (state.ms / longest) * 100)}%"
              ></span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </HoverCardContent>
</HoverCard>
