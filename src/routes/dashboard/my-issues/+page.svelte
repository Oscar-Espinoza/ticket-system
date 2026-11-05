<!-- My issues (port of src/app/dashboard/my-issues/page.tsx). -->
<script lang="ts">
  import type { Component } from 'svelte';
  import BellIcon from '@lucide/svelte/icons/bell';
  import HistoryIcon from '@lucide/svelte/icons/history';
  import PenLineIcon from '@lucide/svelte/icons/pen-line';
  import TargetIcon from '@lucide/svelte/icons/target';

  import IssueGroups from '@/lib/components/navigation/issue-groups.svelte';
  import NavList from '@/lib/components/navigation/list-navigation.svelte';
  import NavIssueRow from '@/lib/components/navigation/nav-issue-row.svelte';
  import PageTabs from '@/lib/components/navigation/page-tabs.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { MyIssuesTab } from './queries.server';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const EMPTY: Record<MyIssuesTab, { icon: Component; title: string; description: string }> = {
    assigned: {
      icon: TargetIcon,
      title: 'Nothing assigned to you',
      description: 'Issues assigned to you in any of your projects show up here.',
    },
    created: {
      icon: PenLineIcon,
      title: 'No issues created yet',
      description: 'Issues you create in any project show up here.',
    },
    subscribed: {
      icon: BellIcon,
      title: 'No subscriptions',
      description: 'Subscribe to an issue to follow its updates; it will show up here.',
    },
    activity: {
      icon: HistoryIcon,
      title: 'No recent activity',
      description: 'Issues you change or comment on show up here, most recent first.',
    },
  };

  const empty = $derived(EMPTY[data.tab]);
  const isEmpty = $derived(
    data.content.kind === 'activity' ? data.content.rows.length === 0 : data.content.issues.length === 0,
  );
</script>

<svelte:head>
  <title>My issues · Ticket System</title>
</svelte:head>

<div class="flex flex-col">
  <h1 class="mb-3 text-xl font-medium">My issues</h1>
  <PageTabs label="My issues" current={data.tab} tabs={data.tabs} />

  {#if isEmpty}
    <EmptyState title={empty.title} description={empty.description}>
      {#snippet icon()}<empty.icon />{/snippet}
    </EmptyState>
  {:else if data.content.kind === 'activity'}
    <NavList class="flex flex-col gap-px">
      {#each data.content.rows as { issue, lastActedAt } (issue.id)}
        <NavIssueRow
          {issue}
          project={data.projectNames[issue.projectId]}
          time={{ date: lastActedAt, label: 'You acted' }}
        />
      {/each}
    </NavList>
  {:else}
    <IssueGroups issues={data.content.issues} projectNames={data.projectNames} />
  {/if}
</div>
