<script lang="ts">
  import { m } from '@/lib/i18n';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  import AuditLogView from '@/lib/components/audit/audit-log-view.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_ws_audit_title({ name: data.workspace.name })}</title>
</svelte:head>

<div class="mx-auto flex max-w-5xl flex-col gap-8">
  <header class="flex items-start gap-3">
    <Button
      variant="ghost"
      size="icon-sm"
      href="/dashboard/workspaces/{data.workspace.slug}"
      aria-label={m.settings_page_back_to_workspace()}
    >
      <ChevronLeftIcon />
    </Button>
    <div class="min-w-0 flex-1">
      <h1 class="text-xl font-medium">{m.settings_page_audit_log()}</h1>
      <p class="mt-0.5 text-sm text-muted-foreground">
        {data.admin
          ? m.settings_page_ws_audit_admin({ workspace: data.workspace.name, count: data.teamCount })
          : m.settings_page_ws_audit_member({ workspace: data.workspace.name })}
      </p>
    </div>
  </header>
  {#if data.audit}
    <AuditLogView data={data.audit} />
  {:else}
    <EmptyState
      title={m.settings_page_admins_only()}
      description={m.settings_page_ws_audit_admins_hint()}
    >
      {#snippet icon()}<ShieldCheckIcon />{/snippet}
    </EmptyState>
  {/if}
</div>
