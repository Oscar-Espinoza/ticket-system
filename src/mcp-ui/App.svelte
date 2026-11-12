<script lang="ts">
  import { view, start } from './lib/app.svelte';
  import ErrorState from './ErrorState.svelte';
  import IssueDetail from './IssueDetail.svelte';
  import IssueList from './IssueList.svelte';
  import ProjectList from './ProjectList.svelte';
  import ProjectOverview from './ProjectOverview.svelte';
  import Skeleton from './Skeleton.svelte';

  $effect(() => {
    void start();
  });

  const content = $derived(view.content);
</script>

<main class="mx-auto {view.displayMode === 'fullscreen' ? 'max-w-3xl' : ''}">
  {#if view.phase === 'loading'}
    <Skeleton />
  {:else if view.phase === 'error'}
    <ErrorState message={view.message} title="Ticket System could not do that" />
  {:else if content?.view === 'issue-list'}
    <IssueList data={content} />
  {:else if content?.view === 'issue-detail'}
    <IssueDetail issue={content.issue} changes={content.changes} />
  {:else if content?.view === 'project-overview'}
    <ProjectOverview data={content} />
  {:else if content?.view === 'project-list'}
    <ProjectList data={content} />
  {:else}
    <!-- No view for this result (or none sent): the text the model got. -->
    <p class="whitespace-pre-wrap text-fg2 [overflow-wrap:anywhere]">{view.message || 'Nothing to show.'}</p>
  {/if}
</main>
