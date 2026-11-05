<script lang="ts">
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  import AuditLogView from '@/lib/components/audit/audit-log-view.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Audit log · {data.workspace.name} · Ticket System</title>
</svelte:head>

<div class="mx-auto flex max-w-5xl flex-col gap-8">
  <header class="flex items-start gap-3">
    <Button
      variant="ghost"
      size="icon-sm"
      href="/dashboard/workspaces/{data.workspace.slug}"
      aria-label="Back to workspace"
    >
      <ChevronLeftIcon />
    </Button>
    <div class="min-w-0 flex-1">
      <h1 class="text-xl font-medium">Audit log</h1>
      <p class="mt-0.5 text-sm text-muted-foreground">
        {data.admin
          ? `Security events for ${data.workspace.name}, plus activity in the ${data.teamCount} ${data.teamCount === 1 ? 'team' : 'teams'} you administer here.`
          : `Security events and team activity for ${data.workspace.name}.`}
      </p>
    </div>
  </header>
  {#if data.audit}
    <AuditLogView data={data.audit} />
  {:else}
    <EmptyState title="Admins only" description="Workspace owners and admins can view and export the audit log.">
      {#snippet icon()}<ShieldCheckIcon />{/snippet}
    </EmptyState>
  {/if}
</div>
