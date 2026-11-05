<!--
  Owner: B4. Sub-issues: the children in `mutations.issues` (optimistic, no
  fetch), progress, inline create (inherits cycle / epic / milestone), attach
  an existing issue, detach, and open a child.
-->
<script lang="ts">
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import PlusIcon from '@lucide/svelte/icons/plus';

  import { ancestorIds } from '@/lib/components/issue-hierarchy/tree';
  import IssueRefRow from '@/lib/components/issue-hierarchy/issue-ref-row.svelte';
  import IssueSearchPicker from '@/lib/components/issue-hierarchy/issue-search-picker.svelte';
  import SectionHeader from '@/lib/components/issue-hierarchy/section-header.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Progress } from '@/lib/components/ui/progress';
  import { StatusIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import { isClosed } from '@/lib/workflow';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  let adding = $state(false);
  let title = $state('');

  const subIssues = $derived(mutations.issues.filter((i) => i.parentId === issue.id));
  // Manual order, then creation order — new sub-issues land at the bottom.
  const ordered = $derived(
    subIssues.toSorted((a, b) => a.sortOrder - b.sortOrder || +new Date(a.createdAt) - +new Date(b.createdAt)),
  );
  const done = $derived(subIssues.filter((child) => isClosed(child.state.type)).length);
  const percent = $derived(subIssues.length ? Math.round((done / subIssues.length) * 100) : 0);

  function create() {
    const next = title.trim();
    if (!next) return;
    mutations.create({
      title: next,
      parentId: issue.id,
      cycleId: issue.cycleId,
      epicId: issue.epicId,
      milestoneId: issue.milestoneId,
    });
    title = '';
  }

  function closeInput() {
    adding = false;
    title = '';
  }

  const exclude = $derived.by(() => {
    const ids = ancestorIds(mutations.issues, issue.id);
    ids.add(issue.id);
    for (const child of subIssues) ids.add(child.id);
    return ids;
  });
</script>

{#snippet meta()}
  <span class="flex items-center gap-2 text-xs text-muted-foreground">
    <StatusIcon type={done === subIssues.length ? 'completed' : 'started'} {percent} size={14} />
    <span class="tabular-nums">
      {done}/{subIssues.length}
    </span>
    <Progress value={percent} class="w-16" aria-label={`${percent}% done`} />
  </span>
{/snippet}

{#if subIssues.length > 0 || canWrite}
  <section aria-label="Sub-issues" class="flex flex-col gap-1">
    <SectionHeader title="Sub-issues" meta={subIssues.length > 0 ? meta : undefined}>
      {#if canWrite}
        <IssueSearchPicker
          issues={mutations.issues}
          {exclude}
          placeholder="Add existing issue as sub-issue…"
          align="end"
          onSelect={(child) => mutations.update(child, { parentId: issue.id })}
        >
          {#snippet children({ props })}
            <Button {...props} variant="ghost" size="icon-xs" aria-label="Add existing issue" title="Add existing issue">
              <Link2Icon />
            </Button>
          {/snippet}
        </IssueSearchPicker>
        <Button variant="ghost" size="icon-xs" aria-label="Add sub-issue" title="Add sub-issue" onclick={() => (adding = true)}>
          <PlusIcon />
        </Button>
      {/if}
    </SectionHeader>

    {#if ordered.length > 0}
      <div class="flex flex-col">
        {#each ordered as child (child.id)}
          <IssueRefRow
            issue={child}
            removeLabel="Remove from parent"
            onRemove={canWrite ? () => mutations.update(child, { parentId: null }) : undefined}
          />
        {/each}
      </div>
    {/if}

    {#if adding}
      <form
        class="flex items-center gap-2 px-1.5"
        onsubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <StatusIcon type="unstarted" size={14} />
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          autofocus
          aria-label="Sub-issue title"
          placeholder="Sub-issue title — Enter to create, Esc to close"
          bind:value={title}
          maxlength={200}
          onblur={() => {
            if (!title.trim()) closeInput();
          }}
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeInput();
            }
          }}
          class="h-7 border-transparent bg-transparent px-1 text-sm shadow-none focus-visible:border-border dark:bg-transparent"
        />
      </form>
    {:else if canWrite && subIssues.length === 0}
      <Button variant="ghost" size="sm" class="w-fit gap-2 font-normal text-muted-foreground" onclick={() => (adding = true)}>
        <PlusIcon />
        Add sub-issue
      </Button>
    {/if}
  </section>
{/if}
