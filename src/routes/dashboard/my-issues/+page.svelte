<script lang="ts">
  import { m } from '@/lib/i18n';
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
      title: m.issues_mine_assigned_title(),
      description: m.issues_mine_assigned_description(),
    },
    created: {
      icon: PenLineIcon,
      title: m.issues_mine_created_title(),
      description: m.issues_mine_created_description(),
    },
    subscribed: {
      icon: BellIcon,
      title: m.issues_mine_subscribed_title(),
      description: m.issues_mine_subscribed_description(),
    },
    activity: {
      icon: HistoryIcon,
      title: m.issues_mine_activity_title(),
      description: m.issues_mine_activity_description(),
    },
  };

  const empty = $derived(EMPTY[data.tab]);
  const isEmpty = $derived(
    data.content.kind === 'activity' ? data.content.rows.length === 0 : data.content.issues.length === 0,
  );
</script>

<svelte:head>
  <title>{m.issues_mine_page_title()}</title>
</svelte:head>

<div class="flex flex-col">
  <h1 class="mb-3 text-xl font-medium">{m.issues_mine()}</h1>
  <PageTabs label={m.issues_mine()} current={data.tab} tabs={data.tabs} />

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
          time={{ date: lastActedAt, label: m.issues_mine_you_acted() }}
        />
      {/each}
    </NavList>
  {:else}
    <IssueGroups issues={data.content.issues} projectNames={data.projectNames} />
  {/if}
</div>
