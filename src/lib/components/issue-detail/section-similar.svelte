<!--
  "Similar issues": trigram + full-text neighbours of this
  issue (already-related ones excluded server-side), each with "Mark as
  duplicate of…" (the relation action, which also moves this issue to the
  Duplicate state) and a per-viewer dismiss kept in localStorage.
-->
<script module lang="ts">
  import { readStorage, writeStorage } from '@/lib/svelte/storage';

  const dismissKey = (issueId: string) => `similar-dismissed:${issueId}`;

  function readDismissed(issueId: string): string[] {
    try {
      const raw = readStorage(dismissKey(issueId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  function writeDismissed(issueId: string, ids: string[]) {
    // Private mode / quota: the dismissal lasts until reload.
    writeStorage(dismissKey(issueId), JSON.stringify(ids.slice(-50)));
  }
</script>

<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { addIssueRelation } from '@/lib/actions/relations';
  import { getSimilarIssues } from '@/lib/actions/similarity';
  import IssueRefRow from '@/lib/components/issue-hierarchy/issue-ref-row.svelte';
  import SectionHeader from '@/lib/components/issue-hierarchy/section-header.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { IssueRow } from '@/lib/issue-model';
  import type { SimilarIssue } from '@/lib/similarity';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  // Tagged with the issue it belongs to, so switching issues never shows stale rows.
  let loaded = $state.raw<{ issueId: string; similar: SimilarIssue[] } | null>(null);
  let dismissed = $state.raw<{ issueId: string; ids: string[] } | null>(null);
  let pending = $state(false);

  $effect(() => {
    const projectId = issue.projectId;
    const issueId = issue.id;
    // Title edits change what "similar" means.
    void issue.title;
    let cancelled = false;
    getSimilarIssues({ projectId, ticketId: issueId })
      .then((result) => {
        if (!cancelled) loaded = { issueId, similar: result.ok ? result.similar : [] };
      })
      .catch(() => {
        // Advisory section: on failure it simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  });

  const hidden = $derived(
    loaded && loaded.issueId === issue.id
      ? new Set(dismissed?.issueId === issue.id ? dismissed.ids : readDismissed(issue.id))
      : new Set<string>(),
  );
  const list = $derived(
    loaded && loaded.issueId === issue.id ? loaded.similar.filter((s) => !hidden.has(s.issue.id)) : [],
  );

  function dismiss(other: IssueRow) {
    const issueId = issue.id;
    const ids = [...hidden, other.id];
    writeDismissed(issueId, ids);
    dismissed = { issueId, ids };
  }

  async function markDuplicate(other: IssueRow) {
    const projectId = issue.projectId;
    const issueId = issue.id;
    const key = issue.key;
    pending = true;
    try {
      const result = await addIssueRelation({
        projectId,
        ticketId: issueId,
        relatedTicketId: other.id,
        kind: 'duplicate_of',
      });
      if (!result.ok) {
        toast.error(actionErrorText(result.error));
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success(`Marked ${key} as a duplicate of ${other.key}`);
      // It's related now, so it no longer belongs in this list.
      if (loaded && loaded.issueId === issueId) {
        loaded = { issueId, similar: loaded.similar.filter((s) => s.issue.id !== other.id) };
      }
    } catch {
      toast.error('Something went wrong — nothing was changed.');
    } finally {
      pending = false;
    }
  }

  // The list's copy is fresher (optimistic state changes).
  const fresh = (other: IssueRow) => mutations.issues.find((i) => i.id === other.id) ?? other;
</script>

{#snippet count()}
  <span class="text-xs text-muted-foreground">{list.length}</span>
{/snippet}

{#if list.length > 0}
  <section aria-label="Similar issues" class="flex flex-col gap-1">
    <SectionHeader title="Similar issues" meta={count} />
    {#each list as { issue: other, reason, score } (other.id)}
      <div title={`${reason} · ${Math.round(score * 100)}% match`}>
        <IssueRefRow issue={fresh(other)} removeLabel="Dismiss" onRemove={() => dismiss(other)}>
          {#snippet trailing()}
            {#if canWrite}
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                onclick={() => void markDuplicate(other)}
                aria-label={`Mark ${issue.key} as a duplicate of ${other.key}`}
                class="gap-1 text-xs font-normal text-muted-foreground opacity-0 group-hover/ref:opacity-100 focus-visible:opacity-100"
              >
                <CopyIcon class="size-3" />
                Mark as duplicate
              </Button>
            {/if}
          {/snippet}
        </IssueRefRow>
      </div>
    {/each}
  </section>
{/if}
