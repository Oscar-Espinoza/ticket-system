<!-- Intake form settings + received customer requests (B11). -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import InboxIcon from '@lucide/svelte/icons/inbox';

  import IntakeSettings from '@/lib/components/integrations/intake-settings.svelte';
  import { EmptyState, StatusIcon } from '@/lib/components/ui-icons';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_intake()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_intake()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_intake_desc()}
</p>

<IntakeSettings
  projectId={data.projectId}
  url={data.url}
  canEdit={data.canEdit}
  triageEnabled={data.triageEnabled}
/>

<Separator class="my-10" />

<h2 class="text-base font-medium">{m.settings_page_requests()}</h2>
<p class="mt-1 mb-4 text-sm text-muted-foreground">
  {m.settings_page_requests_desc({ count: data.requestsShown })}
</p>
{#if data.requests.length === 0}
  <EmptyState
    class="rounded-lg border border-dashed border-border py-10"
    title={m.settings_page_no_requests()}
    description={data.hasToken
      ? m.settings_page_no_requests_shared()
      : m.settings_page_no_requests_off()}
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
                <span class="shrink-0 text-xs text-muted-foreground">{m.settings_page_in_trash()}</span>
              {/if}
            </a>
          {:else}
            <span class="text-muted-foreground">
              {request.hadTicket ? m.settings_page_issue_moved() : m.settings_page_issue_deleted()}
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
          {request.email ?? m.settings_page_no_email()}
        </p>
        <p class="line-clamp-2 text-sm text-muted-foreground">{request.excerpt}</p>
      </li>
    {/each}
  </ul>
{/if}
