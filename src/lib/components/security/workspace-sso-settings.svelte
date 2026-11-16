<!--
  Workspace → Security → Single sign-on.
  One IdP (SAML 2.0 or OIDC) per workspace for one email domain; the
  service-provider URLs are fixed per workspace, so they're shown before
  anything is saved (IdP setup needs them). The form is workspace-sso-form.svelte.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { m } from '@/lib/i18n';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import { toast } from 'svelte-sonner';

  // The wrappers refresh the page data after they resolve (router refresh).
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
  import type { SsoProviderView, SsoUrls } from './sso-types';

  let {
    workspaceId,
    provider,
    enforced: initialEnforced,
    ssoMemberCount,
    unverifiedDomainMemberCount = 0,
    urls,
    txtRecord,
    proofOptional,
    suggestedDomain,
  }: {
    workspaceId: string;
    provider: SsoProviderView | null;
    enforced: boolean;
    ssoMemberCount: number;
    /** Members on the domain who never verified their email (secured at their first SSO sign-in). */
    unverifiedDomainMemberCount?: number;
    urls: SsoUrls;
    /** DNS proof: `<label>.<domain>` TXT = value. */
    txtRecord: { label: string; value: string };
    proofOptional: boolean;
    suggestedDomain: string;
  } = $props();

  let editing = $state(false);
  let removing = $state(false);
  let enforced = $state(untrack(() => initialEnforced));
  // In-flight counter: one pending flag for both actions.
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
        toast.success(next ? m.settings_sec_sso_required_toast() : m.settings_sec_sso_not_required_toast());
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
        toast.success(m.settings_sec_sso_removed_toast());
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
            ? m.settings_sec_sso_no_members()
            : m.settings_sec_sso_members_count({ count: ssoMemberCount })}
          {m.settings_sec_sso_link_note()}
        </p>
      </div>
      <Button variant="outline" size="sm" onclick={() => (editing = true)}>
        <PencilIcon />
        {m.common_edit()}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="text-destructive hover:text-destructive"
        onclick={() => (removing = true)}
      >
        {m.common_remove()}
      </Button>
    </div>

    <div class="flex items-start justify-between gap-6 rounded-lg border border-border px-4 py-3">
      <div>
        <Label for="sso-enforced" class="text-sm font-medium">
          {m.settings_sec_require_sso({ domain: provider.domain })}
        </Label>
        <p class="mt-0.5 text-sm text-muted-foreground">
          {m.settings_sec_require_sso_desc({ domain: provider.domain })}
        </p>
      </div>
      <Switch id="sso-enforced" bind:checked={() => enforced, toggleEnforced} disabled={pending} />
    </div>

    {#if unverifiedDomainMemberCount > 0}
      <p
        data-unverified-members
        class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
      >
        <span class="font-medium">
          {m.settings_sec_unverified({ count: unverifiedDomainMemberCount, domain: provider.domain })}
        </span>
        {m.settings_sec_unverified_note()}
      </p>
    {/if}
  {/if}

  {#if !provider && !editing}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-6"
      title={m.settings_sec_sso_off()}
      description={m.settings_sec_sso_off_desc()}
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
        <AlertDialogTitle>{m.settings_sec_sso_remove_title()}</AlertDialogTitle>
        <AlertDialogDescription>
          {m.settings_sec_sso_remove_desc()}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onclick={remove}>{m.common_remove()}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
