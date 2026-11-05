<!-- Search (port of src/app/dashboard/search/page.tsx). -->
<script lang="ts">
  import SearchIcon from '@lucide/svelte/icons/search';
  import SearchXIcon from '@lucide/svelte/icons/search-x';

  import { documentPath } from '@/components/documents/document-model';
  import DocumentIcon from '@/lib/components/documents/document-icon.svelte';
  import Highlight from '@/lib/components/navigation/highlight.svelte';
  import NavList from '@/lib/components/navigation/list-navigation.svelte';
  import NavIssueRow from '@/lib/components/navigation/nav-issue-row.svelte';
  import SearchControls from '@/lib/components/navigation/search-controls.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const title = $derived(data.q ? `Search: ${data.q.slice(0, 60)}` : 'Search');
</script>

<svelte:head>
  <title>{title} · Ticket System</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-4">
  <h1 class="text-xl font-medium">Search</h1>
  <SearchControls
    query={data.q}
    projectId={data.projectId}
    includeArchived={data.includeArchived}
    projects={data.projects}
  />

  {#if !data.q}
    <EmptyState
      title="Search your issues"
      description="Matches titles, descriptions and comments in every project you belong to. Try phrases in quotes, -word to exclude, or filters like label:bug assignee:me is:open."
    >
      {#snippet icon()}<SearchIcon />{/snippet}
    </EmptyState>
  {:else if data.results.length === 0 && data.docs.length === 0}
    <EmptyState
      title="No results"
      description={data.includeArchived
        ? `Nothing matches “${data.q}”.`
        : `Nothing matches “${data.q}”. Archived issues are excluded — turn on “Include archived” to search them too.`}
    >
      {#snippet icon()}<SearchXIcon />{/snippet}
    </EmptyState>
  {:else}
    {#if data.docs.length > 0}
      <section aria-label="Documents" class="flex flex-col gap-2">
        <p class="px-2 text-xs text-muted-foreground">
          {data.docs.length === 1 ? '1 document' : `${data.docs.length} documents`}
        </p>
        <ul class="flex flex-col gap-px">
          {#each data.docs as doc (doc.id)}
            <li>
              <a
                href={documentPath(doc.projectId, doc.id)}
                class="flex items-start gap-3 rounded-md px-2 py-2 text-sm outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <DocumentIcon icon={doc.icon} class="mt-0.5" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate">{doc.title}</span>
                  {#if doc.excerpt}
                    <span class="line-clamp-1 text-xs text-muted-foreground">
                      {doc.excerpt}
                    </span>
                  {/if}
                </span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {doc.projectName}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if data.results.length > 0}
      <section aria-label="Results" class="flex flex-col gap-2">
        <p class="px-2 text-xs text-muted-foreground">
          {data.results.length === 1 ? '1 result' : `${data.results.length} results`}{#if data.results.length >= 50}{' (showing the best 50)'}{/if}
        </p>
        <NavList class="flex flex-col gap-px">
          {#each data.results as { issue, title: resultTitle, snippet } (issue.id)}
            {#snippet titleContent()}<Highlight text={resultTitle} />{/snippet}
            {#snippet belowContent()}
              {#if snippet}
                {#if snippet.source === 'comment'}<span class="font-medium">Comment: </span>{/if}
                <Highlight text={snippet.text} />
              {:else}
                Archived
              {/if}
            {/snippet}
            <NavIssueRow
              {issue}
              title={titleContent}
              project={data.projectNames[issue.projectId]}
              below={snippet || issue.archivedAt ? belowContent : undefined}
            />
          {/each}
        </NavList>
      </section>
    {/if}
  {/if}
</div>
