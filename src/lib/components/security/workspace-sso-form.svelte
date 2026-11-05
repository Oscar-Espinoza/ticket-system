<!--
  Connect / edit the workspace identity provider (the non-exported SsoForm of
  src/components/security/workspace-sso-settings.tsx).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  // saveWorkspaceSso refreshes the page data after it resolves.
  import { saveWorkspaceSso, type SaveSsoInput, type SecurityField } from '@/lib/actions/security';
  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import SetupNotes from './setup-notes.svelte';
  import type { Protocol, SsoProviderView, SsoUrls } from './workspace-sso-settings.svelte';

  let {
    workspaceId,
    provider,
    urls,
    txtRecord,
    proofOptional,
    suggestedDomain,
    onCancel,
    onSaved,
  }: {
    workspaceId: string;
    provider: SsoProviderView | null;
    urls: SsoUrls;
    txtRecord: { label: string; value: string };
    proofOptional: boolean;
    suggestedDomain: string;
    onCancel?: () => void;
    onSaved: () => void;
  } = $props();

  // useState initial values: read once from the provider, like React.
  const initial = untrack(() => provider);
  let protocol = $state<Protocol>(initial?.protocol ?? 'saml');
  let domain = $state(initial?.domain ?? '');
  let samlMode = $state<'metadata' | 'manual'>(
    initial?.saml && !initial.saml.hasMetadata ? 'manual' : 'metadata',
  );
  let values = $state({
    samlMetadata: '',
    samlEntryPoint: initial?.saml?.entryPoint ?? '',
    samlIssuer: initial?.protocol === 'saml' ? initial.issuer : '',
    samlCert: '',
    oidcIssuer: initial?.protocol === 'oidc' ? initial.issuer : '',
    oidcClientId: initial?.oidc?.clientId ?? '',
    oidcClientSecret: '',
  });
  let error = $state<{ field?: SecurityField; message: string } | null>(null);
  let pending = $state(false);

  type ValueKey = keyof typeof values;

  /** Controlled field: write the value and clear that field's error. */
  function setValue(key: ValueKey, value: string | undefined) {
    values[key] = value ?? '';
    if (error?.field === key) error = null;
  }
  const fieldError = (field: SecurityField) => (error?.field === field ? error.message : undefined);
  const invalid = (field: SecurityField) => ({
    'aria-invalid': error?.field === field,
    'aria-describedby': error?.field === field ? `sso-${field}-error` : undefined,
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const input: SaveSsoInput = {
      workspaceId,
      protocol,
      domain,
      ...(protocol === 'saml'
        ? samlMode === 'metadata'
          ? { samlMetadata: values.samlMetadata, samlIssuer: values.samlIssuer }
          : {
              samlEntryPoint: values.samlEntryPoint,
              samlIssuer: values.samlIssuer,
              samlCert: values.samlCert,
            }
        : {
            oidcIssuer: values.oidcIssuer,
            oidcClientId: values.oidcClientId,
            oidcClientSecret: values.oidcClientSecret,
          }),
    };
    // Read before the await: the wrapper refreshes page data before resolving,
    // so `provider` would already be the newly saved one (React's closure kept
    // the render-time value).
    const wasConfigured = !!provider;
    pending = true;
    try {
      const result = await saveWorkspaceSso(input);
      if (result.ok) {
        toast.success(wasConfigured ? 'Single sign-on updated' : 'Single sign-on is set up');
        onSaved();
      } else {
        error = { field: result.field, message: result.error };
        if (!result.field) toast.error(result.error);
      }
    } finally {
      pending = false;
    }
  }

  const domainPreview = $derived(domain.trim().replace(/^@/, '') || suggestedDomain || 'acme.com');
  const keepingSamlMetadata = $derived(provider?.saml?.hasMetadata && samlMode === 'metadata');
</script>

<form onsubmit={submit} novalidate class="flex flex-col gap-6 rounded-lg border border-border px-4 py-4">
  <div class="flex items-center justify-between gap-4">
    <p class="text-sm font-medium">{provider ? 'Edit identity provider' : 'Connect an identity provider'}</p>
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0}
      variant="outline"
      bind:value={() => protocol, (next) => next && (protocol = next as Protocol)}
      aria-label="Protocol"
    >
      <ToggleGroupItem value="saml" class="h-7 px-2.5 text-xs">SAML 2.0</ToggleGroupItem>
      <ToggleGroupItem value="oidc" class="h-7 px-2.5 text-xs">OpenID Connect</ToggleGroupItem>
    </ToggleGroup>
  </div>

  <Field id="sso-domain" label="Email domain" error={fieldError('domain')} hint="People with this email domain (and its subdomains) sign in through this provider.">
    <Input
      id="sso-domain"
      placeholder={suggestedDomain || 'acme.com'}
      bind:value={
        () => domain,
        (v) => {
          domain = v ?? '';
          if (error?.field === 'domain') error = null;
        }
      }
      autocomplete="off"
      {...invalid('domain')}
    />
  </Field>

  <div class="flex flex-col gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
    <p>
      <span class="font-medium text-foreground">Domain verification.</span>
      {proofOptional
        ? 'Skipped in development. In production, prove the domain with this DNS record (keep it published — SSO stops trusting the domain if it is removed):'
        : 'Add this DNS TXT record and keep it published — SSO stops trusting the domain if it is removed:'}
    </p>
    <p class="font-mono">
      {txtRecord.label}.{domainPreview} TXT
    </p>
    <CopyField value={txtRecord.value} label="TXT value" />
  </div>

  {#if protocol === 'saml'}
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-sm font-medium">Give these to your identity provider</legend>
      <Field id="sso-acs" label="ACS (reply) URL">
        <CopyField id="sso-acs" value={urls.acsUrl} label="ACS URL" />
      </Field>
      <Field id="sso-entity" label="SP entity ID / audience">
        <CopyField id="sso-entity" value={urls.spEntityId} label="Entity ID" />
      </Field>
      <p class="text-xs text-muted-foreground">
        Name ID format: email address. Service provider metadata is served at the entity ID URL once
        saved.
      </p>
    </fieldset>

    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 flex w-full items-center justify-between gap-4 text-sm font-medium">
        From your identity provider
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0}
          bind:value={() => samlMode, (next) => next && (samlMode = next as 'metadata' | 'manual')}
          aria-label="SAML configuration"
        >
          <ToggleGroupItem value="metadata" class="h-6 px-2 text-xs">Metadata XML</ToggleGroupItem>
          <ToggleGroupItem value="manual" class="h-6 px-2 text-xs">Manual</ToggleGroupItem>
        </ToggleGroup>
      </legend>
      {#if samlMode === 'metadata'}
        <Field
          id="sso-samlMetadata"
          label="IdP metadata XML"
          error={fieldError('samlMetadata')}
          hint={keepingSamlMetadata
            ? 'Leave blank to keep the saved metadata.'
            : 'Okta: Sign On → Metadata URL (open it and copy). Keycloak: realm → Endpoints → SAML 2.0 Identity Provider Metadata.'}
        >
          <Textarea
            id="sso-samlMetadata"
            rows={5}
            spellcheck={false}
            class="font-mono text-xs"
            placeholder={'<md:EntityDescriptor entityID="…">'}
            bind:value={() => values.samlMetadata, (v) => setValue('samlMetadata', v)}
            {...invalid('samlMetadata')}
          />
        </Field>
      {:else}
        <Field id="sso-samlEntryPoint" label="SSO URL" error={fieldError('samlEntryPoint')}>
          <Input
            id="sso-samlEntryPoint"
            placeholder="https://acme.okta.com/app/…/sso/saml"
            bind:value={() => values.samlEntryPoint, (v) => setValue('samlEntryPoint', v)}
            {...invalid('samlEntryPoint')}
          />
        </Field>
        <Field
          id="sso-samlCert"
          label="X.509 signing certificate"
          error={fieldError('samlCert')}
          hint={provider?.saml?.hasCert ? 'Leave blank to keep the saved certificate.' : undefined}
        >
          <Textarea
            id="sso-samlCert"
            rows={4}
            spellcheck={false}
            class="font-mono text-xs"
            placeholder="-----BEGIN CERTIFICATE-----"
            bind:value={() => values.samlCert, (v) => setValue('samlCert', v)}
            {...invalid('samlCert')}
          />
        </Field>
      {/if}
      <Field
        id="sso-samlIssuer"
        label="IdP entity ID (issuer)"
        error={fieldError('samlIssuer')}
        hint={samlMode === 'metadata' ? 'Optional — read from the metadata.' : undefined}
      >
        <Input
          id="sso-samlIssuer"
          placeholder="http://www.okta.com/exk…"
          bind:value={() => values.samlIssuer, (v) => setValue('samlIssuer', v)}
          {...invalid('samlIssuer')}
        />
      </Field>
    </fieldset>
  {:else}
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-sm font-medium">Give this to your identity provider</legend>
      <Field id="sso-redirect" label="Redirect (callback) URI">
        <CopyField id="sso-redirect" value={urls.oidcRedirectUri} label="Redirect URI" />
      </Field>
    </fieldset>
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-sm font-medium">From your identity provider</legend>
      <Field id="sso-oidcIssuer" label="Issuer URL" error={fieldError('oidcIssuer')} hint="Endpoints are discovered from /.well-known/openid-configuration.">
        <Input
          id="sso-oidcIssuer"
          placeholder="https://acme.okta.com or https://keycloak.acme.com/realms/acme"
          bind:value={() => values.oidcIssuer, (v) => setValue('oidcIssuer', v)}
          {...invalid('oidcIssuer')}
        />
      </Field>
      <Field id="sso-oidcClientId" label="Client ID" error={fieldError('oidcClientId')}>
        <Input
          id="sso-oidcClientId"
          autocomplete="off"
          bind:value={() => values.oidcClientId, (v) => setValue('oidcClientId', v)}
          {...invalid('oidcClientId')}
        />
      </Field>
      <Field
        id="sso-oidcClientSecret"
        label="Client secret"
        error={fieldError('oidcClientSecret')}
        hint={provider?.oidc?.hasSecret ? 'Leave blank to keep the current secret.' : undefined}
      >
        <Input
          id="sso-oidcClientSecret"
          type="password"
          autocomplete="new-password"
          placeholder={provider?.oidc?.hasSecret ? '••••••••' : undefined}
          bind:value={() => values.oidcClientSecret, (v) => setValue('oidcClientSecret', v)}
          {...invalid('oidcClientSecret')}
        />
      </Field>
    </fieldset>
  {/if}

  <SetupNotes {protocol} />

  {#if error && !error.field}<p class="text-sm text-destructive">{error.message}</p>{/if}

  <div class="flex justify-end gap-2">
    {#if onCancel}
      <Button type="button" variant="ghost" onclick={onCancel}>Cancel</Button>
    {/if}
    <Button type="submit" disabled={pending}>
      {#if pending}<Loader2Icon class="animate-spin" />{/if}
      {provider ? 'Save changes' : 'Save and turn on'}
    </Button>
  </div>
</form>
