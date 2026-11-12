<script lang="ts">
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
  <title>Security · {workspace.name} · Ticket System</title>
</svelte:head>

{#snippet header()}
  <header class="flex items-start gap-3">
    <Button
      variant="ghost"
      size="icon-sm"
      href={`/dashboard/workspaces/${workspace.slug}`}
      aria-label="Back to workspace"
    >
      <ChevronLeftIcon />
    </Button>
    <div class="min-w-0 flex-1">
      <h1 class="text-xl font-medium">Security</h1>
      <p class="mt-0.5 text-sm text-muted-foreground">
        Single sign-on, user provisioning and AI assistant access for {workspace.name}.
      </p>
    </div>
    {#if workspaceRoleAllows(workspace.role, 'admin')}
      <Button variant="outline" size="sm" href={`/dashboard/workspaces/${workspace.slug}/audit`}>
        <ScrollTextIcon />
        Audit log
      </Button>
    {/if}
  </header>
{/snippet}

{#if !data.security}
  <div class="mx-auto flex max-w-3xl flex-col gap-10">
    {@render header()}
    <EmptyState
      title="Admins only"
      description="Workspace owners and admins manage single sign-on, provisioning and AI assistant access."
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
        <h2 class="text-base font-medium">Single sign-on</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Let people sign in with your identity provider (SAML 2.0 or OpenID Connect). New people
          from your domain join the workspace as members on first sign-in.
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
        <h2 class="text-base font-medium">SCIM provisioning</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Keep workspace membership in sync with your identity provider.
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
        <h2 class="text-base font-medium">AI assistants</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Whether members may use Claude, ChatGPT and other AI assistants with this workspace’s
          issues (through the MCP connector, see Settings → OAuth apps).
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
