<script lang="ts">
  import type { InboxView, IssueListView, IssueSummary, NotificationRow as Notification, PageSource } from '@/lib/server/mcp/contracts';
  import { callTool, holdRefresh, host, toggleFullscreen, view } from './lib/app.svelte';
  import ErrorState from './ErrorState.svelte';
  import Icon from './Icon.svelte';
  import IssueRows from './IssueRows.svelte';
  import NotificationRow from './NotificationRow.svelte';

  let { data }: { data: IssueListView | InboxView } = $props();

  // Rows loaded so far: the first page from the tool result, then pages from "Load more".
  let extra = $state.raw<(IssueSummary | Notification)[]>([]);
  let cursor = $state<string | null>(null);
  let cursorSet = $state(false);
  let loadingMore = $state(false);
  let moreError = $state('');

  const isInbox = $derived('notifications' in data);
  const source = $derived<PageSource | null>(data.source ?? null);
  const nextCursor = $derived(cursorSet ? cursor : data.nextCursor);
  const firstPage = $derived<(IssueSummary | Notification)[]>('notifications' in data ? data.notifications : data.issues);
  const all = $derived([...firstPage, ...extra]);
  const issues = $derived(all.filter((r): r is IssueSummary => 'key' in r && 'state' in r));
  const notifications = $derived(all.filter((r): r is Notification => 'sentence' in r));
  const groupBy = $derived('groupBy' in data ? (data.groupBy ?? null) : null);
  const crossProject = $derived(new Set(issues.map((i) => i.project.id)).size > 1);
  const count = $derived(isInbox ? notifications.length : issues.length);
  const fullscreen = $derived(view.displayMode === 'fullscreen');
  const noun = $derived(isInbox ? 'notification' : 'issue');

  // More pages are on screen (or on their way): a refresh would replace the first page under them.
  $effect(() => {
    if (extra.length > 0 || loadingMore) return holdRefresh();
  });

  async function loadMore() {
    if (!source || !nextCursor || loadingMore) return;
    loadingMore = true;
    moreError = '';
    const result = await callTool(source.tool, { ...source.arguments, cursor: nextCursor });
    loadingMore = false;
    const content = result.content;
    if (!result.ok || !content || content.view !== 'issue-list') {
      moreError = result.text || 'Could not load more.';
      return;
    }
    const rows = 'notifications' in content ? content.notifications : content.issues;
    const seen = new Set(all.map((r) => r.id));
    extra = [...extra, ...rows.filter((r) => !seen.has(r.id))];
    cursor = content.nextCursor;
    cursorSet = true;
  }
</script>

<section class="space-y-2" aria-label={data.title}>
  <header class="flex items-center justify-between gap-2">
    <h1 class="line-clamp-2 min-w-0 text-[1.15em] leading-snug font-semibold [overflow-wrap:anywhere]">{data.title}</h1>
    <div class="flex shrink-0 items-center gap-2">
      <span class="text-right text-fg2">{count}{nextCursor ? '+' : ''} {noun}{count === 1 && !nextCursor ? '' : 's'}</span>
      {#if host.canFullscreen && (fullscreen || count > 6)}
        <button
          type="button"
          class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-viewsm border border-line text-fg2 hover:bg-bg2 hover:text-fg"
          aria-label={fullscreen ? 'Exit full screen' : 'Show full screen'}
          title={fullscreen ? 'Exit full screen' : 'Show full screen'}
          onclick={toggleFullscreen}
        >
          <Icon name={fullscreen ? 'collapse' : 'expand'} size={14} />
        </button>
      {/if}
    </div>
  </header>

  {#if count === 0}
    <p class="rounded-view border border-dashed border-line2 px-3 py-6 text-center text-fg2">
      {isInbox ? 'Your inbox is empty.' : 'No issues match.'}
    </p>
  {:else if isInbox}
    <ul class="overflow-hidden rounded-view border border-line px-1">
      {#each notifications as n (n.id)}
        <NotificationRow notification={n} />
      {/each}
    </ul>
  {:else}
    <div class="overflow-hidden rounded-view border border-line px-1">
      <IssueRows {issues} {groupBy} showProject={crossProject} />
    </div>
  {/if}

  {#if moreError}
    <ErrorState message={moreError} title="Could not load more" />
  {/if}
  {#if nextCursor && source && host.canCallTools}
    <div class="flex justify-center pt-1">
      <button
        type="button"
        class="inline-flex min-h-8 items-center gap-2 rounded-view border border-line2 px-4 font-medium hover:bg-bg2 disabled:opacity-70"
        aria-busy={loadingMore}
        disabled={loadingMore}
        onclick={loadMore}
      >
        {#if loadingMore}<span class="size-3.5 animate-spin rounded-full border-2 border-line2 border-t-fg" aria-hidden="true"></span>{/if}
        {loadingMore ? 'Loading more…' : 'Load more'}
      </button>
    </div>
  {:else if nextCursor}
    <p class="text-center text-fg2">More results exist; ask the assistant for the next page.</p>
  {/if}
</section>
