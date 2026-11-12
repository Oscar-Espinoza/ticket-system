<script lang="ts">
  import type { NotificationRow } from '@/lib/server/mcp/contracts';
  import { host } from './lib/app.svelte';
  import { relativeTime } from './lib/model';
  import ExpandedIssue from './ExpandedIssue.svelte';
  import Icon from './Icon.svelte';
  import OpenLink from './OpenLink.svelte';

  let { notification: n }: { notification: NotificationRow } = $props();
  let open = $state(false);
  const when = $derived(relativeTime(n.at, new Date(), host.context.locale));
</script>

<li class="border-b border-line last:border-b-0">
  <div class="flex items-start gap-1.5 px-1.5 py-2">
    {#if n.issue}
      <button type="button" class="flex min-w-0 flex-1 items-start gap-2 rounded-viewsm text-left hover:bg-bg2" aria-expanded={open} aria-controls="n-{n.id}" onclick={() => (open = !open)}>
        <span class="mt-1.5 size-2 shrink-0 rounded-full {n.read ? 'bg-transparent' : 'bg-accent'}" role="img" aria-label={n.read ? 'Read' : 'Unread'}></span>
        <span class="min-w-0 flex-1">
          <span class="block [overflow-wrap:anywhere] {n.read ? 'text-fg2' : 'font-medium'}">{n.sentence}</span>
          <span class="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-fg3">
            <span class="font-code">{n.issue.key}</span>
            {#if n.project}<span>{n.project.name}</span>{/if}
            <time datetime={n.at}>{when}</time>
          </span>
        </span>
        <span class="mt-1"><Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} /></span>
      </button>
    {:else}
      <span class="mt-1.5 ml-1.5 size-2 shrink-0 rounded-full {n.read ? 'bg-transparent' : 'bg-accent'}" role="img" aria-label={n.read ? 'Read' : 'Unread'}></span>
      <div class="min-w-0 flex-1">
        <p class="[overflow-wrap:anywhere] {n.read ? 'text-fg2' : 'font-medium'}">{n.sentence}</p>
        <p class="mt-0.5 flex flex-wrap gap-x-1.5 text-fg3">{#if n.project}<span>{n.project.name}</span>{/if}<time datetime={n.at}>{when}</time></p>
      </div>
    {/if}
    <OpenLink url={n.url} label="Open in Ticket System" compact />
  </div>
  {#if open && n.issue}
    <div id="n-{n.id}" class="mb-2 ml-5 border-l border-line pl-3">
      <ExpandedIssue issueKey={n.issue.key} />
    </div>
  {/if}
</li>
