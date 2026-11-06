<!--
  Member profile (port of src/app/dashboard/people/[userId]/page.tsx).
  loading.tsx is not ported per page: the dashboard layout shows the
  navigation progress indicator (PLAN.md "Pages and data loading").
-->
<script lang="ts">
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import CircleDotIcon from '@lucide/svelte/icons/circle-dot';
  import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
  import PencilIcon from '@lucide/svelte/icons/pencil';

  import { issuePath } from '@/lib/issue-links';
  import { Avatar, EmptyState, LabelChip, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import { PROJECT_ROLE_LABEL } from '@/lib/roles';
  import LocalTime from '@/lib/components/people/local-time.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const person = $derived(data.person);
  const isSelf = $derived(data.isSelf);
</script>

<svelte:head>
  <title>{person.name ?? 'Profile'} · Ticket System</title>
</svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-10">
  <header class="flex items-start gap-4">
    <Avatar
      name={person.name}
      src={person.image}
      class="data-[size=sm]:size-16 [&_[data-slot=avatar-fallback]]:text-lg"
    />
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-xl font-medium">{person.name}</h1>
      {#if person.title}<p class="text-sm">{person.title}</p>{/if}
      <p class="mt-1 truncate text-sm text-muted-foreground">{person.email}</p>
      {#if person.timezone}
        <p class="mt-1 text-sm text-muted-foreground">
          <LocalTime timeZone={person.timezone} />
        </p>
      {/if}
    </div>
    {#if isSelf}
      <Button variant="outline" size="sm" href="/dashboard/settings/profile">
        <PencilIcon />
        Edit profile
      </Button>
    {/if}
  </header>

  {#if person.bio}
    <p class="-mt-4 text-sm leading-relaxed whitespace-pre-line">{person.bio}</p>
  {/if}

  <section aria-labelledby="person-projects">
    <h2 id="person-projects" class="mb-3 text-base font-medium">
      {isSelf ? 'Your projects' : 'Shared projects'}
      <span class="text-muted-foreground">· {data.shared.length}</span>
    </h2>
    {#if data.shared.length === 0}
      <EmptyState class="rounded-lg border py-8" title="No projects yet">
        {#snippet icon()}<FolderKanbanIcon />{/snippet}
      </EmptyState>
    {:else}
      <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
        {#each data.shared as project (project.id)}
          <li>
            <a
              href={`/dashboard/projects/${project.id}`}
              class="flex min-h-10 items-center gap-2.5 px-3 py-2 outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <LabelChip dot={false} class="font-mono">
                {project.ticketKey}
              </LabelChip>
              <span class="min-w-0 flex-1 truncate text-sm">{project.name}</span>
              <span class="text-xs text-muted-foreground">
                {PROJECT_ROLE_LABEL[project.role]}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-labelledby="person-issues">
    <h2 id="person-issues" class="mb-3 text-base font-medium">
      Assigned issues <span class="text-muted-foreground">· {data.assigned.length}</span>
    </h2>
    {#if data.assigned.length === 0}
      <EmptyState
        class="rounded-lg border py-8"
        title="No open issues"
        description={isSelf
          ? 'Nothing is assigned to you right now.'
          : `Nothing open is assigned to ${person.name} in projects you share.`}
      >
        {#snippet icon()}<CircleDotIcon />{/snippet}
      </EmptyState>
    {:else}
      <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
        {#each data.assigned as issue (issue.id)}
          <li>
            <a
              href={issuePath(issue.projectId, issue.key)}
              class="flex min-h-10 items-center gap-2.5 px-3 py-2 outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <PriorityIcon priority={issue.priority} size={14} />
              <span class="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {issue.key}
              </span>
              <StateIcon state={issue.state} size={14} />
              <span class="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
              <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {issue.projectName}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-labelledby="person-activity">
    <h2 id="person-activity" class="mb-3 text-base font-medium">Recent activity</h2>
    {#if data.recent.length === 0}
      <EmptyState
        class="rounded-lg border py-8"
        title="No recent activity"
        description="Changes they make in projects you share show up here."
      >
        {#snippet icon()}<ActivityIcon />{/snippet}
      </EmptyState>
    {:else}
      <ol class="flex flex-col gap-2.5">
        {#each data.recent as item (item.id)}
          <li class="flex items-baseline gap-2 text-sm">
            <span class="min-w-0 flex-1 truncate">
              <span class="text-muted-foreground">{item.summary}</span>{#if item.key}{' '}{#if item.linkable}<a
                    href={issuePath(item.projectId, item.key)}
                    class="font-medium hover:underline"
                    >{item.key}{#if item.title}<span class="font-normal">{' '}{item.title}</span>{/if}</a
                  >{:else}<span class="font-medium"
                    >{item.key}{#if item.title}<span class="font-normal">{' '}{item.title}</span>{/if}</span
                  >{/if}{:else}<span class="text-muted-foreground">{' '}in {item.projectName}</span>{/if}
            </span>
            <time datetime={item.createdAt} class="shrink-0 text-xs text-muted-foreground">
              {item.ago}
            </time>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</div>
