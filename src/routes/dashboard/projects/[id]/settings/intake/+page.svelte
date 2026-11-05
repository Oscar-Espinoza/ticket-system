<!-- Intake form settings + received customer requests (B11). -->
<script lang="ts">
  import InboxIcon from '@lucide/svelte/icons/inbox';

  import IntakeSettings from '@/lib/components/integrations/intake-settings.svelte';
  import { EmptyState, StatusIcon } from '@/lib/components/ui-icons';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Intake form · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Intake form</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  A public form that turns customer requests into issues.
</p>

<IntakeSettings
  projectId={data.projectId}
  url={data.url}
  canEdit={data.canEdit}
  triageEnabled={data.triageEnabled}
/>

<Separator class="my-10" />

<h2 class="text-base font-medium">Requests</h2>
<p class="mt-1 mb-4 text-sm text-muted-foreground">
  The latest {data.requestsShown} submissions and the issues they created.
</p>
{#if data.requests.length === 0}
  <EmptyState
    class="rounded-lg border border-dashed border-border py-10"
    title="No requests yet"
    description={data.hasToken
      ? 'Share the public link — submissions show up here.'
      : 'Turn on the form to start collecting requests.'}
  >
    {#snippet icon()}<InboxIcon />{/snippet}
  </EmptyState>
{:else}
  <ul class="divide-y divide-border rounded-lg border border-border">
    {#each data.requests as request (request.id)}
      <li class="flex flex-col gap-1 px-3 py-2.5">
        <div class="flex items-center gap-2 text-sm">
          {#if request.linked}
            <a
              href={request.linked.href}
              class="flex min-w-0 items-center gap-2 hover:underline"
            >
              <StatusIcon
                type={request.linked.stateType}
                color={request.linked.stateColor ?? undefined}
                aria-label={request.linked.stateName ?? undefined}
                size={14}
              />
              <span class="shrink-0 font-mono text-xs text-muted-foreground">
                {request.linked.key}
              </span>
              <span class="truncate font-medium">{request.linked.title}</span>
              {#if request.linked.inTrash}
                <span class="shrink-0 text-xs text-muted-foreground">(in trash)</span>
              {/if}
            </a>
          {:else}
            <span class="text-muted-foreground">
              {request.hadTicket ? 'Issue moved to a team you’re not in' : 'Issue deleted'}
            </span>
          {/if}
          <time
            datetime={request.createdAtIso}
            class="ml-auto shrink-0 text-xs text-muted-foreground"
          >
            {request.createdAtLabel}
          </time>
        </div>
        <p class="text-xs text-muted-foreground">
          {#if request.customer}
            <a
              href={request.customer.href}
              class="font-medium text-foreground hover:underline"
            >
              {request.customer.name}
            </a>
            {' · '}
          {/if}
          {request.name ? `${request.name} · ` : ''}
          {request.email ?? 'No email'}
        </p>
        <p class="line-clamp-2 text-sm text-muted-foreground">{request.excerpt}</p>
      </li>
    {/each}
  </ul>
{/if}
