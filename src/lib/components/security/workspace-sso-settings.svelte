<!--
  Workspace → Security → Single sign-on (port of src/components/security/workspace-sso-settings.tsx).
  One IdP (SAML 2.0 or OIDC) per workspace for one email domain; the
  service-provider URLs are fixed per workspace, so they're shown before
  anything is saved (IdP setup needs them). The form is workspace-sso-form.svelte.
-->
<script module lang="ts">
  export type Protocol = 'saml' | 'oidc';

  export interface SsoProviderView {
    protocol: Protocol;
    domain: string;
    issuer: string;
    saml: { entryPoint: string; hasMetadata: boolean; hasCert: boolean } | null;
    oidc: { clientId: string; hasSecret: boolean } | null;
  }

  export interface SsoUrls {
    acsUrl: string;
    spEntityId: string;
    metadataUrl: string;
    oidcRedirectUri: string;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import { toast } from 'svelte-sonner';

  // The wrappers refresh the page data after they resolve (React's router.refresh()).
  import { removeWorkspaceSso, setSsoEnforced } from '@/lib/actions/security';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { EmptyState, LabelChip } from '@/lib/components/ui-icons';
  import SsoForm from './workspace-sso-form.svelte';

  let {
    workspaceId,
    provider,
    enforced: initialEnforced,
    ssoMemberCount,
    urls,
    txtRecord,
    proofOptional,
    suggestedDomain,
  }: {
    workspaceId: string;
    provider: SsoProviderView | null;
    enforced: boolean;
    ssoMemberCount: number;
    urls: SsoUrls;
    /** DNS proof: `<label>.<domain>` TXT = value. */
    txtRecord: { label: string; value: string };
    proofOptional: boolean;
    suggestedDomain: string;
  } = $props();

  let editing = $state(false);
  let removing = $state(false);
  let enforced = $state(untrack(() => initialEnforced));
  // useTransition: one pending flag for both actions.
  let running = $state(0);
  const pending = $derived(running > 0);

  async function transition(task: () => Promise<void>) {
    running++;
    try {
      await task();
    } finally {
      running--;
    }
  }

  function toggleEnforced(next: boolean) {
    enforced = next;
    void transition(async () => {
      const result = await setSsoEnforced({ workspaceId, enforced: next });
      if (result.ok) {
        toast.success(next ? 'SSO is now required' : 'SSO is no longer required');
      } else {
        enforced = !next;
        toast.error(result.error);
      }
    });
  }

  function remove() {
    void transition(async () => {
      const result = await removeWorkspaceSso({ workspaceId });
      if (result.ok) {
        toast.success('Single sign-on removed');
        enforced = false;
      } else toast.error(result.error);
    });
  }

  const showForm = $derived(editing || !provider);
</script>

<div class="flex flex-col gap-4">
  {#if provider && !editing}
    <div class="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
      <span
        aria-hidden="true"
        class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <KeyRoundIcon class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-2 text-sm font-medium">
          @{provider.domain}
          <LabelChip color="done">{provider.protocol === 'saml' ? 'SAML' : 'OIDC'}</LabelChip>
        </p>
        <p class="mt-0.5 truncate text-sm text-muted-foreground" title={provider.issuer}>
          {provider.issuer}
        </p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {ssoMemberCount === 0
            ? 'No members have signed in with SSO yet.'
            : `${ssoMemberCount} ${ssoMemberCount === 1 ? 'member has' : 'members have'} signed in with SSO.`}
          Existing accounts link on first SSO sign-in; a password set up without a verified email is
          removed then.
        </p>
      </div>
      <Button variant="outline" size="sm" onclick={() => (editing = true)}>
        <PencilIcon />
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive"
        onclick={() => (removing = true)}
      >
        Remove
      </Button>
    </div>

    <div class="flex items-start justify-between gap-6 rounded-lg border border-border px-4 py-3">
      <div>
        <Label for="sso-enforced" class="text-sm font-medium">
          Require SSO for @{provider.domain}
        </Label>
        <p class="mt-0.5 text-sm text-muted-foreground">
          People with @{provider.domain} emails can’t sign in or sign up with a password or GitHub —
          only through your identity provider.
        </p>
      </div>
      <Switch id="sso-enforced" bind:checked={() => enforced, toggleEnforced} disabled={pending} />
    </div>
  {/if}

  {#if !provider && !editing}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-6"
      title="Single sign-on is off"
      description="Connect Okta, Microsoft Entra, Google Workspace, Keycloak or any SAML 2.0 / OIDC identity provider below."
    >
      {#snippet icon()}<KeyRoundIcon />{/snippet}
    </EmptyState>
  {/if}

  {#if showForm}
    <SsoForm
      {workspaceId}
      {provider}
      {urls}
      {txtRecord}
      {proofOptional}
      {suggestedDomain}
      onCancel={provider ? () => (editing = false) : undefined}
      onSaved={() => (editing = false)}
    />
  {/if}

  <AlertDialog bind:open={removing}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Remove single sign-on?</AlertDialogTitle>
        <AlertDialogDescription>
          Members can no longer sign in through your identity provider, and SSO stops being
          required. People who only ever used SSO can’t sign in until it’s set up again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onclick={remove}>Remove</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
