<!--
  Archive and trash pages: a searchable list of archived / trashed issues with
  Restore, plus "Delete permanently" (admins) in the trash. Mutations go
  through useIssueMutations with an `include` scope, so a restored issue drops
  out of this list optimistically.
-->
<script module lang="ts">
  import type { IssueRow } from '@/lib/issue-model';

  type Mode = 'archive' | 'trash';

  const INCLUDE: Record<Mode, (issue: IssueRow) => boolean> = {
    archive: (i) => !!i.archivedAt && !i.deletedAt,
    trash: (i) => !!i.deletedAt,
  };
</script>

<script lang="ts">
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import ArchiveRestoreIcon from '@lucide/svelte/icons/archive-restore';
  import SearchXIcon from '@lucide/svelte/icons/search-x';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import Undo2Icon from '@lucide/svelte/icons/undo-2';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { purgeIssue } from '@/lib/actions/tickets';
  import { useIssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { EmptyState } from '@/lib/components/ui-icons';
  import NavList from './list-navigation.svelte';
  import NavIssueRow from './nav-issue-row.svelte';

  let { mode, issues: serverIssues }: { mode: Mode; issues: IssueRow[] } = $props();

  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');
  const mutations = useIssueMutations(
    () => serverIssues,
    () => ({ include: INCLUDE[mode] }),
  );
  // useOptimistic: purged ids hide their rows until the purge (and the refresh
  // that drops them from `serverIssues`) settles.
  let purged = $state<string[]>([]);
  let query = $state('');
  let confirm = $state<IssueRow | null>(null);

  const visible = $derived(mutations.issues.filter((issue) => !purged.includes(issue.id)));
  const q = $derived(query.trim().toLowerCase());
  const listed = $derived(
    q
      ? visible.filter((issue) => issue.key.toLowerCase().includes(q) || issue.title.toLowerCase().includes(q))
      : visible,
  );

  const restore = (issue: IssueRow) =>
    mode === 'archive'
      ? mutations.unarchive(issue, () => toast.success(`Unarchived ${issue.key}`))
      : mutations.restore(issue, () => toast.success(`Restored ${issue.key}`));

  async function purge(issue: IssueRow) {
    confirm = null;
    purged = [...purged, issue.id];
    try {
      const result = await purgeIssue({ projectId: issue.projectId, id: issue.id });
      if (result.ok) toast.success(`Deleted ${issue.key} permanently`);
      else toast.error(actionErrorText(result.error, 'Only admins can delete issues permanently.'));
    } catch {
      toast.error('Something went wrong — the issue was not deleted.');
    } finally {
      purged = purged.filter((id) => id !== issue.id);
    }
  }
</script>

{#if visible.length === 0}
  {#if mode === 'archive'}
    <EmptyState
      title="No archived issues"
      description="Archive issues you no longer need in the list. They stay searchable here and can be unarchived any time."
    >
      {#snippet icon()}<ArchiveIcon />{/snippet}
    </EmptyState>
  {:else}
    <EmptyState title="Trash is empty" description="Deleted issues stay here for 30 days before they are removed for good.">
      {#snippet icon()}<Trash2Icon />{/snippet}
    </EmptyState>
  {/if}
{:else}
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3">
      <Input
        type="search"
        aria-label={mode === 'archive' ? 'Search archived issues' : 'Search deleted issues'}
        placeholder="Filter by key or title…"
        bind:value={query}
        class="h-8 max-w-xs"
      />
      <p class="text-xs text-muted-foreground">
        {visible.length}
        {visible.length === 1 ? 'issue' : 'issues'}{#if mode === 'trash'}{' · permanently deleted 30 days after being moved to the trash'}{/if}
      </p>
    </div>

    {#if listed.length === 0}
      <EmptyState title="No matching issues" description={`Nothing matches “${query.trim()}”.`}>
        {#snippet icon()}<SearchXIcon />{/snippet}
      </EmptyState>
    {:else}
      <NavList class="flex flex-col gap-px">
        {#each listed as issue (issue.id)}
          {#snippet actions()}
            <Button size="xs" variant="outline" onclick={() => restore(issue)}>
              {#if mode === 'archive'}<ArchiveRestoreIcon />{:else}<Undo2Icon />{/if}
              {mode === 'archive' ? 'Unarchive' : 'Restore'}
            </Button>
            {#if mode === 'trash' && isAdmin.current}
              <Button
                size="xs"
                variant="ghost"
                class="text-destructive hover:text-destructive"
                onclick={() => (confirm = issue)}
              >
                Delete permanently
              </Button>
            {/if}
          {/snippet}
          <NavIssueRow
            {issue}
            time={mode === 'archive'
              ? { date: issue.archivedAt ?? issue.updatedAt, label: 'Archived' }
              : { date: issue.deletedAt ?? issue.updatedAt, label: 'Deleted' }}
            actions={canWrite.current ? actions : undefined}
          />
        {/each}
      </NavList>
    {/if}

    <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && (confirm = null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {confirm?.key} permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            “{confirm?.title}” and its comments, attachments and history are removed for good. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onclick={() => confirm && purge(confirm)}>
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
{/if}
