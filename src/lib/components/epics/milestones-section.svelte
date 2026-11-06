<!--
  Milestones of one epic: inline add / rename, target date, progress, and
  reorder via the row menu or Alt+↑/↓. Changes apply optimistically and roll
  back when the server refuses (the refreshed props win either way).
-->
<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import {
    createMilestone,
    deleteMilestone,
    reorderMilestones,
    updateMilestone,
  } from '@/lib/actions/epics';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { EMPTY_PROGRESS, type MilestoneRow } from '@/lib/epic-model';
  import MilestoneGlyph from './milestone-glyph.svelte';
  import MilestoneItem from './milestone-item.svelte';
  import { Optimistic } from './optimistic.svelte';

  type Op =
    | { type: 'add'; milestone: MilestoneRow }
    | { type: 'patch'; id: string; patch: Partial<MilestoneRow> }
    | { type: 'remove'; id: string }
    | { type: 'order'; ids: string[] };

  function reduce(list: MilestoneRow[], op: Op): MilestoneRow[] {
    switch (op.type) {
      case 'add':
        return [...list, op.milestone];
      case 'patch':
        return list.map((m) => (m.id === op.id ? { ...m, ...op.patch } : m));
      case 'remove':
        return list.filter((m) => m.id !== op.id);
      case 'order': {
        const byId = new Map(list.map((m) => [m.id, m]));
        return op.ids.flatMap((id) => byId.get(id) ?? []);
      }
    }
  }

  let {
    projectId,
    epicId,
    milestones,
    color,
    canWrite,
  }: {
    projectId: string;
    epicId: string;
    milestones: MilestoneRow[];
    color: string | null;
    canWrite: boolean;
  } = $props();

  const optimistic = new Optimistic(() => milestones, reduce);
  const list = $derived(optimistic.current);
  let adding = $state(false);
  let draft = $state('');
  let listEl = $state<HTMLDivElement | null>(null);

  const run = (op: Op, action: () => Promise<{ ok: boolean; error?: string }>) =>
    void optimistic.transition(async () => {
      optimistic.apply(op);
      const result = await action();
      if (!result.ok) toast.error(result.error ?? 'Something went wrong.');
    });

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    draft = '';
    run(
      {
        type: 'add',
        milestone: {
          id: `temp-${crypto.randomUUID()}`,
          epicId,
          name,
          description: null,
          targetDate: null,
          sortOrder: Number.MAX_SAFE_INTEGER,
          progress: EMPTY_PROGRESS,
        },
      },
      () => createMilestone({ projectId, epicId, name }),
    );
  };

  const move = (id: string, delta: -1 | 1) => {
    const ids = list.map((m) => m.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length || ids.some((i) => i.startsWith('temp-'))) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    run({ type: 'order', ids }, () => reorderMilestones({ projectId, epicId, ids }));
    // Keep focus on the moved row after the re-render.
    requestAnimationFrame(() =>
      listEl?.querySelector<HTMLElement>(`[data-milestone-row="${id}"]`)?.focus(),
    );
  };
</script>

<section aria-labelledby="milestones-heading" class="flex flex-col gap-2">
  <div class="flex items-center gap-2">
    <h2 id="milestones-heading" class="text-sm font-medium">Milestones</h2>
    <span class="text-xs text-muted-foreground tabular-nums">{list.length}</span>
    {#if canWrite && !adding}
      <Button
        variant="ghost"
        size="icon-xs"
        class="ml-auto"
        aria-label="Add milestone"
        onclick={() => (adding = true)}
      >
        <PlusIcon />
      </Button>
    {/if}
  </div>

  {#if list.length === 0 && !adding}
    <p class="text-sm text-muted-foreground">
      Break the epic into checkpoints with their own target dates.{#if canWrite}{' '}<button
          type="button"
          class="text-foreground underline-offset-2 hover:underline"
          onclick={() => (adding = true)}>Add a milestone</button
        >{/if}
    </p>
  {/if}

  {#if list.length > 0}
    <div bind:this={listEl} role="list" class="flex flex-col rounded-md border border-border">
      {#each list as milestone, index (milestone.id)}
        <MilestoneItem
          {milestone}
          {color}
          canWrite={canWrite && !milestone.id.startsWith('temp-')}
          isFirst={index === 0}
          isLast={index === list.length - 1}
          onMove={(delta) => move(milestone.id, delta)}
          onRename={(name) =>
            run({ type: 'patch', id: milestone.id, patch: { name } }, () =>
              updateMilestone({ projectId, id: milestone.id, name }),
            )}
          onTargetDate={(targetDate) =>
            run({ type: 'patch', id: milestone.id, patch: { targetDate } }, () =>
              updateMilestone({ projectId, id: milestone.id, targetDate }),
            )}
          onDelete={() =>
            run({ type: 'remove', id: milestone.id }, () =>
              deleteMilestone({ projectId, id: milestone.id }),
            )}
        />
      {/each}
    </div>
  {/if}

  {#if adding}
    <form
      class="flex items-center gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <MilestoneGlyph class="ml-3 text-muted-foreground" />
      <!-- svelte-ignore a11y_autofocus -->
      <Input
        autofocus
        bind:value={draft}
        maxlength={80}
        placeholder="Milestone name — Enter to add, Esc to close"
        aria-label="New milestone name"
        class="h-8"
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            draft = '';
            adding = false;
          }
        }}
        onblur={() => {
          if (!draft.trim()) adding = false;
        }}
      />
      <Button type="submit" size="sm" disabled={!draft.trim()}>Add</Button>
    </form>
  {/if}
</section>
