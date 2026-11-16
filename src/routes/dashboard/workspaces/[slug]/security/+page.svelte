<script lang="ts">
  import { m } from '@/lib/i18n';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

  import { workspaceRoleAllows } from '@/lib/workspace-types';
  import { Button } from '@/lib/components/ui/button';
  import { Separator } from '@/lib/components/ui/separator';
  import { EmptyState } from '@/lib/components/ui-icons';
  import AiConnectorsSettings from '@/lib/components/security/ai-connectors-settings.svelte';
  import ScimSettings from '@/lib/components/security/scim-settings.svelte';
  import WorkspaceSsoSettings from '@/lib/components/security/workspace-sso-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const workspace = $derived(data.workspace);
</script>

<svelte:head>
  <title>{m.settings_page_ws_security_title({ name: workspace.name })}</title>
</svelte:head>

{#snippet header()}
  <header class="flex items-start gap-3">
    <Button
      variant="ghost"
      size="icon-sm"
      href={`/dashboard/workspaces/${workspace.slug}`}
      aria-label={m.settings_page_back_to_workspace()}
    >
      <ChevronLeftIcon />
    </Button>
    <div class="min-w-0 flex-1">
      <h1 class="text-xl font-medium">{m.settings_page_security()}</h1>
      <p class="mt-0.5 text-sm text-muted-foreground">
        {m.settings_page_ws_security_desc({ name: workspace.name })}
      </p>
    </div>
    {#if workspaceRoleAllows(workspace.role, 'admin')}
      <Button variant="outline" size="sm" href={`/dashboard/workspaces/${workspace.slug}/audit`}>
        <ScrollTextIcon />
        {m.settings_page_audit_log()}
      </Button>
    {/if}
  </header>
{/snippet}

{#if !data.security}
  <div class="mx-auto flex max-w-3xl flex-col gap-10">
    {@render header()}
    <EmptyState
      title={m.settings_page_admins_only()}
      description={m.settings_page_ws_security_admins_hint()}
    >
      {#snippet icon()}<ShieldCheckIcon />{/snippet}
    </EmptyState>
  </div>
{:else}
  {@const security = data.security}
  <!-- Kit reuses the page when [slug] changes, so key the local state. -->
  {#key security.workspaceId}
  <div class="mx-auto flex max-w-3xl flex-col gap-10">
    {@render header()}

    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-base font-medium">{m.settings_page_sso()}</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">
          {m.settings_page_sso_desc()}
        </p>
      </div>
      <WorkspaceSsoSettings
        workspaceId={security.workspaceId}
        provider={security.provider}
        enforced={security.enforced}
        ssoMemberCount={security.ssoMemberCount}
        unverifiedDomainMemberCount={security.unverifiedDomainMemberCount}
        urls={security.urls}
        txtRecord={security.txtRecord}
        proofOptional={security.proofOptional}
        suggestedDomain={security.suggestedDomain}
      />
    </section>

    <Separator />

    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-base font-medium">{m.settings_page_scim()}</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">
          {m.settings_page_scim_desc()}
        </p>
      </div>
      <ScimSettings
        workspaceId={security.workspaceId}
        configured={security.scimConfigured}
        baseUrl={security.scimBaseUrl}
      />
    </section>

    <Separator />

    <section class="flex flex-col gap-3">
      <div>
        <h2 class="text-base font-medium">{m.settings_page_ai()}</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">
          {m.settings_page_ai_desc()}
        </p>
      </div>
      <AiConnectorsSettings
        workspaceId={security.workspaceId}
        allowed={security.aiConnectorsAllowed}
      />
    </section>
  </div>
  {/key}
{/if}
