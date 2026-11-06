<!--
  "Parent" property row: set / change / clear the parent issue and
  jump to it. The server rejects self / descendant parents; the client just
  keeps those out of the picker, and any server error toasts via mutations.
-->
<script lang="ts">
  import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
  import GitForkIcon from '@lucide/svelte/icons/git-fork';
  import type { Snippet } from 'svelte';

  import { descendantIds } from '@/lib/components/issue-hierarchy/tree';
  import IssueSearchPicker from '@/lib/components/issue-hierarchy/issue-search-picker.svelte';
  import { useOpenIssue } from '@/lib/components/issue-hierarchy/open-issue.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { StateIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import PropertyRow from './property-row.svelte';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  const open = useOpenIssue();
  const parent = $derived(
    issue.parentId ? (mutations.issues.find((i) => i.id === issue.parentId) ?? null) : null,
  );
  const exclude = $derived.by(() => {
    const ids = descendantIds(mutations.issues, issue.id);
    ids.add(issue.id);
    return ids;
  });

  const setParent = (parentId: string | null) => mutations.update(issue, { parentId });
</script>

{#snippet picker(trigger: Snippet<[Record<string, unknown>]>)}
  {#if canWrite}
    <IssueSearchPicker
      issues={mutations.issues}
      {exclude}
      value={issue.parentId}
      placeholder="Set parent issue…"
      onSelect={(next) => setParent(next.id)}
      onClear={issue.parentId ? () => setParent(null) : undefined}
      clearLabel="Remove parent"
    >
      {#snippet children({ props })}{@render trigger(props)}{/snippet}
    </IssueSearchPicker>
  {:else}
    {@render trigger({})}
  {/if}
{/snippet}

{#snippet setTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" disabled={!canWrite} class="-ml-2 max-w-full gap-2 font-normal">
    <GitForkIcon class="text-muted-foreground" />
    <span class="text-muted-foreground">Set parent</span>
  </Button>
{/snippet}

{#snippet changeTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="icon-xs" aria-label="Change parent issue">
    <ChevronsUpDownIcon />
  </Button>
{/snippet}

{#if !issue.parentId}
  <PropertyRow label="Parent">
    {@render picker(setTrigger)}
  </PropertyRow>
{:else}
  <PropertyRow label="Parent">
    <div class="-ml-2 flex min-w-0 items-center">
      {#if parent}
        <Button
          variant="ghost"
          size="sm"
          class="min-w-0 flex-1 justify-start gap-2 font-normal"
          title={`Open ${parent.key}`}
          onclick={() => open(parent)}
        >
          <StateIcon state={parent.state} size={14} />
          <span class="shrink-0 font-mono text-xs text-muted-foreground">{parent.key}</span>
          <span class="truncate">{parent.title}</span>
        </Button>
      {:else}
        <!-- Archived parents aren't in the active list; still changeable/clearable. -->
        <span class="min-w-0 flex-1 truncate px-2 text-sm text-muted-foreground">
          Archived issue
        </span>
      {/if}
      {#if canWrite}
        {@render picker(changeTrigger)}
      {/if}
    </div>
  </PropertyRow>
{/if}
