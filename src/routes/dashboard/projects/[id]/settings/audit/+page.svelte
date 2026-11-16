<!--
  Project settings › Audit log: every recorded event for this team (issue and
  comment activity, member / role / settings changes) plus its workspace's
  security events. Owners and admins only.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  import AuditLogView from '@/lib/components/audit/audit-log-view.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_audit_title({ name: data.projectName })}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_audit_log()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_audit_desc({ name: data.projectName })}
</p>
{#if data.audit}
  <AuditLogView data={data.audit} />
{:else}
  <EmptyState
    title={m.settings_page_admins_only()}
    description={m.settings_page_audit_admins_hint()}
  >
    {#snippet icon()}<ShieldCheckIcon />{/snippet}
  </EmptyState>
{/if}
