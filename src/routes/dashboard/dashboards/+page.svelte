<!--
  Dashboards (yours + shared into your projects) and the Pulse tab: the epic
  update feed and this week's numbers across your projects.
-->
<script lang="ts">
  import DashboardList from '@/lib/components/dashboards/dashboard-list.svelte';
  import NewDashboardButton from '@/lib/components/dashboards/new-dashboard-button.svelte';
  import PulseFeed from '@/lib/components/dashboards/pulse-feed.svelte';
  import { cn } from '@/lib/utils';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const tabClass = (active: boolean) =>
    cn(
      '-mb-px border-b-2 px-1 pb-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
    );
</script>

<svelte:head>
  <title>{data.pulse ? 'Pulse' : 'Dashboards'}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-4">
  <div class="flex items-center gap-3">
    <h1 class="text-xl font-medium">{data.pulse ? 'Pulse' : 'Dashboards'}</h1>
    {#if !data.pulse}
      <div class="ml-auto">
        <NewDashboardButton projects={data.projects} />
      </div>
    {/if}
  </div>
  <nav aria-label="Dashboards sections" class="flex gap-4 border-b border-border">
    <a
      href="/dashboard/dashboards"
      aria-current={!data.pulse ? 'page' : undefined}
      class={tabClass(!data.pulse)}
    >
      Dashboards
    </a>
    <a
      href="/dashboard/dashboards?tab=pulse"
      aria-current={data.pulse ? 'page' : undefined}
      class={tabClass(data.pulse)}
    >
      Pulse
    </a>
  </nav>
  {#if data.feed}
    <PulseFeed pulse={data.feed} days={data.days} />
  {:else}
    <DashboardList dashboards={data.dashboards} />
  {/if}
</div>
