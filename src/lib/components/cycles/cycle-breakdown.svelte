<!-- Cycle sidebar: progress per assignee / label over the cycle's current issues. -->
<script module lang="ts">
  import type { IssueRow } from '@/lib/issue-model';
  import type { ChartUnit } from '@/lib/cycle-utils';

  type BucketIcon =
    | { kind: 'avatar'; name: string; image: string | null }
    | { kind: 'unassigned' }
    | { kind: 'dot'; color: string };

  interface Bucket {
    id: string;
    label: string;
    icon: BucketIcon;
    total: number;
    done: number;
  }

  function bucketize(
    issues: IssueRow[],
    unit: ChartUnit,
    keys: (issue: IssueRow) => { id: string; label: string; icon: BucketIcon }[],
  ): Bucket[] {
    const map = new Map<string, Bucket>();
    for (const issue of issues) {
      // Canceled issues are out of scope, like the burndown.
      if (issue.state.type === 'canceled') continue;
      const weight = unit === 'points' ? (issue.estimate ?? 0) : 1;
      const done = issue.state.type === 'completed';
      for (const key of keys(issue)) {
        const bucket = map.get(key.id) ?? { ...key, total: 0, done: 0 };
        bucket.total += weight;
        if (done) bucket.done += weight;
        map.set(key.id, bucket);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }
</script>

<script lang="ts">
  import UserRound from '@lucide/svelte/icons/user-round';

  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/components/ui/tabs';
  import { Avatar } from '@/lib/components/ui-icons';
  import { percent } from '@/lib/cycle-utils';
  import UnitToggle from './unit-toggle.svelte';

  let {
    issues,
    estimatesEnabled,
  }: {
    issues: IssueRow[];
    estimatesEnabled: boolean;
  } = $props();

  let unit = $state<ChartUnit>('issues');
  const effective: ChartUnit = $derived(estimatesEnabled ? unit : 'issues');

  const assignees = $derived(
    bucketize(issues, effective, (issue) => [
      issue.assignee
        ? {
            id: issue.assignee.id,
            label: issue.assignee.name,
            icon: { kind: 'avatar', name: issue.assignee.name, image: issue.assignee.image ?? null },
          }
        : { id: '__none', label: 'Unassigned', icon: { kind: 'unassigned' } },
    ]),
  );
  const labels = $derived(
    bucketize(issues, effective, (issue) =>
      issue.labels.map((label) => ({
        id: label.id,
        label: label.name,
        icon: { kind: 'dot', color: label.color },
      })),
    ),
  );
</script>

{#snippet bucketList(buckets: Bucket[], empty: string)}
  {#if buckets.length === 0}
    <p class="py-4 text-center text-xs text-muted-foreground">{empty}</p>
  {:else}
    <ul class="flex flex-col gap-2.5">
      {#each buckets as b (b.id)}
        <li class="flex flex-col gap-1">
          <div class="flex items-center gap-2 text-sm">
            {#if b.icon.kind === 'avatar'}
              <Avatar name={b.icon.name} src={b.icon.image} size={20} />
            {:else if b.icon.kind === 'unassigned'}
              <UserRound class="size-5 text-muted-foreground" aria-hidden="true" />
            {:else}
              <span
                aria-hidden="true"
                class="mx-1 size-2 shrink-0 rounded-full"
                style:background={b.icon.color}
              ></span>
            {/if}
            <span class="min-w-0 flex-1 truncate">{b.label}</span>
            <span class="text-xs text-muted-foreground tabular-nums">
              {b.done}/{b.total}{effective === 'points' ? ' pts' : ''} · {percent(b.done, b.total)}%
            </span>
          </div>
          <div aria-hidden="true" class="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div class="h-full bg-primary" style:width="{percent(b.done, b.total)}%"></div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<section class="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
  <Tabs defaultValue="assignees" class="gap-3">
    <div class="flex items-center gap-2">
      <TabsList variant="line" class="h-7">
        <TabsTrigger value="assignees" class="text-xs">Assignees</TabsTrigger>
        <TabsTrigger value="labels" class="text-xs">Labels</TabsTrigger>
      </TabsList>
      {#if estimatesEnabled}
        <div class="ml-auto">
          <UnitToggle value={unit} onChange={(next) => (unit = next)} />
        </div>
      {/if}
    </div>
    <TabsContent value="assignees">
      {@render bucketList(assignees, 'No issues in this cycle.')}
    </TabsContent>
    <TabsContent value="labels">
      {@render bucketList(labels, 'No labeled issues in this cycle.')}
    </TabsContent>
  </Tabs>
</section>
