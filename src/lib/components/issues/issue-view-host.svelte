<!--
  Renders one IssueViewDefinition (views.ts): the list directly, code-split
  views behind their loading skeleton.
  - `lazy.ssr: true` (board, table): the server awaits the chunk (async SSR)
    and renders the view's HTML; the client hydrates that HTML once its own
    import resolves, without showing the skeleton.
  - `lazy.ssr: false` (calendar, timeline): the server renders the skeleton
    and the client swaps the view in.
  - On the client, switching to a not-yet-loaded view shows the skeleton
    (fresh boundary per view id); loaded modules are cached in the browser,
    so switching back renders at once.
  - A chunk that fails to load (e.g. stale deploy) shows the dashboard error
    state ("Something went wrong" + "Try again", same UI as +error.svelte)
    in the view area instead of staying blank; "Try again" re-runs the import.
-->
<script module lang="ts">
  import type { Component } from 'svelte';

  import type { IssueViewDefinition, IssueViewProps } from './views';

  // Browser only: the server must not short-circuit to a cached module, or
  // its markup would differ from the hydrating client's first render.
  const loaded = new Map<string, Component<IssueViewProps>>();

  async function loadView(view: IssueViewDefinition): Promise<Component<IssueViewProps>> {
    const mod = await view.lazy!.load();
    if (typeof window !== 'undefined') loaded.set(view.id, mod.default);
    return mod.default;
  }
</script>

<script lang="ts">
  import { browser } from '$app/env';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import { COLUMN_WIDTH_CLASS } from '@/lib/components/board/board-layout';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState, Skeleton } from '@/lib/components/ui-icons';

  let { view, ...viewProps }: IssueViewProps & { view: IssueViewDefinition } = $props();

  const Direct = $derived(view.component ?? (browser ? loaded.get(view.id) : undefined) ?? null);
  // Server + ssr view: no pending snippet, so the server awaits the chunk and
  // renders the view. Everywhere else the skeleton covers the load (during
  // hydration the boundary follows what the server rendered).
  const pending = $derived(!browser && view.lazy?.ssr ? undefined : loading);
</script>

{#snippet loading()}
  {#if view.lazy?.loading === 'board'}
    <div class="flex gap-3">
      {#each { length: 5 }, i (i)}
        <Skeleton variant="card" class={`h-64 ${COLUMN_WIDTH_CLASS} shrink-0`} />
      {/each}
    </div>
  {:else if view.lazy?.loading === 'rows'}
    <div class="flex flex-col gap-1">
      {#each { length: 8 }, i (i)}
        <Skeleton variant="row" />
      {/each}
    </div>
  {:else}
    <Skeleton variant="card" class="h-[32rem] w-full" />
  {/if}
{/snippet}

{#snippet failed(error: unknown, reset: () => void)}
  <EmptyState title="Something went wrong" description="This page failed to load. Try again, or come back in a moment.">
    {#snippet icon()}<TriangleAlertIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" onclick={reset}>Try again</Button>
    {/snippet}
  </EmptyState>
{/snippet}

{#if Direct}
  <Direct {...viewProps} />
{:else if view.lazy}
  {#key view.id}
    <svelte:boundary {pending} {failed} onerror={(error) => console.error(error)}>
      {@const View = await loadView(view)}
      <View {...viewProps} />
    </svelte:boundary>
  {/key}
{/if}
