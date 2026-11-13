<script lang="ts">
  import type { ProjectListView } from '@/lib/server/mcp/contracts';
  import { host } from './lib/app.svelte';
  import Chip from './Chip.svelte';
  import Icon from './Icon.svelte';

  let { data }: { data: ProjectListView } = $props();
  let refused = $state('');

  async function open(url: string) {
    refused = (await host.openLink(url)) ? '' : url;
  }
</script>

<section class="space-y-2" aria-label="Projects">
  <header class="flex items-baseline justify-between gap-2">
    <h1 class="text-[1.15em] font-semibold">Projects</h1>
    <span class="text-fg2">{data.projects.length}</span>
  </header>
  {#if data.projects.length === 0}
    <p class="rounded-view border border-dashed border-line2 px-3 py-6 text-center text-fg2">No projects yet.</p>
  {:else}
    <ul class="grid gap-2 @md:grid-cols-2">
      {#each data.projects as project (project.id)}
        <li>
          <button
            type="button"
            class="flex h-full w-full flex-col gap-1.5 rounded-view border border-line p-3 text-left hover:bg-bg2"
            aria-label="Open {project.name} in Ticket System"
            onclick={() => open(project.url)}
          >
            <span class="flex min-w-0 items-start gap-2">
              <span class="shrink-0 rounded-viewsm bg-bg3 px-1.5 py-0.5 font-code font-semibold">{project.key}</span>
              <span class="line-clamp-2 min-w-0 flex-1 pt-0.5 font-semibold [overflow-wrap:anywhere]">{project.name}</span>
              <span class="pt-1"><Icon name="external" size={13} /></span>
            </span>
            {#if project.description}
              <span class="line-clamp-2 text-fg2 [overflow-wrap:anywhere]">{project.description}</span>
            {/if}
            <span class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-fg2">
              <span><span class="text-[1.1em] font-semibold text-fg">{project.openIssues}</span> open</span>
              {#if project.workspace}<span class="inline-flex min-w-0 items-center gap-1"><Icon name="folder" size={12} /><span class="truncate">{project.workspace.name}</span></span>{/if}
              <Chip>{project.role}</Chip>
            </span>
          </button>
        </li>
      {/each}
    </ul>
    {#if refused}
      <p class="text-fg2" role="status">Your assistant can't open links from here. Address: <span class="break-all select-all">{refused}</span></p>
    {/if}
  {/if}
</section>
