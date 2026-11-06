<!--
  Pulse tab: this week's numbers per project, then the epic update feed
  (newest first) across the viewer's projects.
-->
<script lang="ts">
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

  import { epicPath } from '@/lib/epic-model';
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import HealthChip from '@/lib/components/epics/health-chip.svelte';
  import { Avatar, EmptyState } from '@/lib/components/ui-icons';
  import type { Pulse } from '@/lib/pulse';
  import { relativeTime } from '@/lib/relative-time';

  let { pulse, days }: { pulse: Pulse; days: number } = $props();

  const active = $derived(pulse.projects.filter((p) => p.created + p.completed + p.updates > 0));
</script>

<div class="flex flex-col gap-6">
  <section aria-labelledby="pulse-week" class="flex flex-col gap-2">
    <h2 id="pulse-week" class="px-2 text-xs font-medium text-muted-foreground">Last 7 days</h2>
    {#if active.length === 0}
      <p class="px-2 text-sm text-muted-foreground">No issues created or completed in your projects this week.</p>
    {:else}
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {#each active as project (project.projectId)}
          <li>
            <a
              href={`/dashboard/projects/${project.projectId}/insights`}
              class="flex flex-col gap-2 rounded-lg border border-border p-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span class="flex items-center gap-2 text-sm font-medium">
                <span class="truncate">{project.projectName}</span>
                <span class="font-mono text-xs text-muted-foreground">{project.projectKey}</span>
              </span>
              <span class="flex gap-4 text-xs text-muted-foreground">
                <span>
                  <span class="text-base font-medium text-foreground tabular-nums">{project.completed}</span> completed
                </span>
                <span>
                  <span class="text-base font-medium text-foreground tabular-nums">{project.created}</span> created
                </span>
                <span>
                  <span class="text-base font-medium text-foreground tabular-nums">{project.updates}</span>{' '}
                  {project.updates === 1 ? 'update' : 'updates'}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-labelledby="pulse-updates" class="flex flex-col gap-2">
    <h2 id="pulse-updates" class="px-2 text-xs font-medium text-muted-foreground">
      Epic updates · last {days} days
    </h2>
    {#if pulse.updates.length === 0}
      <EmptyState
        title="No epic updates yet"
        description="Post an update on an epic (health + a short note) and it shows up here and in everyone's weekly pulse."
      >
        {#snippet icon()}<ActivityIcon />{/snippet}
      </EmptyState>
    {:else}
      <ol class="flex flex-col">
        {#each pulse.updates as update (update.id)}
          <li class="flex gap-3 border-b border-border/60 px-2 py-3 last:border-b-0">
            <Avatar
              name={update.authorName ?? 'Former member'}
              src={update.authorImage}
              size={24}
              class="mt-0.5 shrink-0"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <a
                  href={epicPath(update.projectId, update.epicId)}
                  class="flex min-w-0 items-center gap-1.5 font-medium hover:underline"
                >
                  <EpicIcon color={update.epicColor} />
                  <span class="truncate">{update.epicName}</span>
                </a>
                <span class="font-mono text-xs text-muted-foreground">{update.projectKey}</span>
                {#if update.previousHealth && update.previousHealth !== update.health}
                  <HealthChip health={update.previousHealth} class="opacity-60" />
                  <ArrowRightIcon class="size-3 text-muted-foreground" aria-label="changed to" />
                {/if}
                <HealthChip health={update.health} />
                <time
                  datetime={new Date(update.createdAt).toISOString()}
                  title={new Date(update.createdAt).toLocaleString()}
                  class="ml-auto text-xs text-muted-foreground tabular-nums"
                >
                  {relativeTime(update.createdAt)}
                </time>
              </div>
              {#if update.excerpt}
                <p class="line-clamp-3 text-sm text-muted-foreground">{update.excerpt}</p>
              {/if}
              <p class="text-xs text-muted-foreground">{update.authorName ?? 'Former member'}</p>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</div>
