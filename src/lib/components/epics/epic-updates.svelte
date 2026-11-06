<!--
  Epic updates: a composer (health + markdown, ⌘Enter to post) and the feed.
  Posting also sets the epic's health (server-side, in the same batch).
-->
<script lang="ts">
  import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
  import { toast } from 'svelte-sonner';

  import { deleteEpicUpdate } from '@/lib/actions/epics';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { ProjectMember } from '@/lib/project-data-types';
  import type { EpicUpdateRow, Health } from '@/lib/epic-model';
  import { canDeleteUpdate } from './epic-update-rules';
  import { Optimistic } from './optimistic.svelte';
  import UpdateCard from './update-card.svelte';
  import UpdateComposer from './update-composer.svelte';

  let {
    projectId,
    epicId,
    updates,
    currentHealth,
    viewer,
    canWrite,
    isAdmin,
  }: {
    projectId: string;
    epicId: string;
    updates: EpicUpdateRow[];
    currentHealth: Health | null;
    viewer: ProjectMember;
    canWrite: boolean;
    isAdmin: boolean;
  } = $props();

  const optimistic = new Optimistic(
    () => updates,
    (list: EpicUpdateRow[], id: string) => list.filter((u) => u.id !== id),
  );
  const feed = $derived(optimistic.current);

  const remove = (update: EpicUpdateRow) =>
    void optimistic.transition(async () => {
      optimistic.apply(update.id);
      const result = await deleteEpicUpdate({ projectId, id: update.id });
      if (!result.ok) toast.error(result.error);
    });
</script>

<div class="flex max-w-2xl flex-col gap-6">
  {#if canWrite}
    <UpdateComposer {projectId} {epicId} initialHealth={currentHealth ?? 'on_track'} />
  {/if}
  {#if feed.length === 0}
    <EmptyState
      title="No updates yet"
      description="Post a short update to tell everyone how this epic is going. The latest update sets its health."
    >
      {#snippet icon()}<MessageSquareTextIcon />{/snippet}
    </EmptyState>
  {:else}
    <ol class="flex flex-col gap-4" aria-label="Updates">
      {#each feed as update (update.id)}
        <li>
          <UpdateCard
            {update}
            canDelete={canWrite && canDeleteUpdate(isAdmin, update.author?.id, viewer.id)}
            onDelete={() => remove(update)}
          />
        </li>
      {/each}
    </ol>
  {/if}
</div>
