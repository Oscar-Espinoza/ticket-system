<!--
  Project settings › Audit log: every recorded event for this team (issue and
  comment activity, member / role / settings changes) plus its workspace's
  security events. Owners and admins only.
-->
<script lang="ts">
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  import AuditLogView from '@/lib/components/audit/audit-log-view.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Audit log · {data.projectName} · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Audit log</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Who changed what in {data.projectName}. Export it as CSV or JSON (up to 50,000 events).
</p>
{#if data.audit}
  <AuditLogView data={data.audit} />
{:else}
  <EmptyState
    title="Admins only"
    description="Team owners and admins can view and export the audit log."
  >
    {#snippet icon()}<ShieldCheckIcon />{/snippet}
  </EmptyState>
{/if}
