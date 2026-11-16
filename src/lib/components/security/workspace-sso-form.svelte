<!-- Connect / edit the workspace identity provider. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
  import type { Protocol, SsoProviderView, SsoUrls } from './sso-types';

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

  // useState initial values: read once from the provider.
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
    // so `provider` would already be the newly saved one (keep the render-time value).
    const wasConfigured = !!provider;
    pending = true;
    try {
      const result = await saveWorkspaceSso(input);
      if (result.ok) {
        toast.success(wasConfigured ? m.settings_sec_sso_updated_toast() : m.settings_sec_sso_set_up_toast());
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
    <p class="text-sm font-medium">{provider ? m.settings_sec_sso_edit_idp() : m.settings_sec_sso_connect_idp()}</p>
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0}
      variant="outline"
      bind:value={() => protocol, (next) => next && (protocol = next as Protocol)}
      aria-label={m.settings_sec_protocol()}
    >
      <ToggleGroupItem value="saml" class="h-7 px-2.5 text-xs">SAML 2.0</ToggleGroupItem> <!-- i18n-ignore -->
      <ToggleGroupItem value="oidc" class="h-7 px-2.5 text-xs">OpenID Connect</ToggleGroupItem> <!-- i18n-ignore -->
    </ToggleGroup>
  </div>

  <Field id="sso-domain" label={m.settings_sec_email_domain()} error={fieldError('domain')} hint={m.settings_sec_email_domain_hint()}>
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
      <span class="font-medium text-foreground">{m.settings_sec_domain_verification()}</span>
      {proofOptional
        ? m.settings_sec_dns_dev()
        : m.settings_sec_dns_prod()}
    </p>
    <p class="font-mono">
      {txtRecord.label}.{domainPreview} TXT <!-- i18n-ignore -->
    </p>
    <CopyField value={txtRecord.value} label={m.settings_sec_txt_value()} />
  </div>

  {#if protocol === 'saml'}
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-sm font-medium">{m.settings_sec_give_idp()}</legend>
      <Field id="sso-acs" label={m.settings_sec_acs_url_field()}>
        <CopyField id="sso-acs" value={urls.acsUrl} label={m.settings_sec_acs_url()} />
      </Field>
      <Field id="sso-entity" label={m.settings_sec_entity_field()}>
        <CopyField id="sso-entity" value={urls.spEntityId} label={m.settings_sec_entity_id()} />
      </Field>
      <p class="text-xs text-muted-foreground">
        {m.settings_sec_nameid_note()}
      </p>
    </fieldset>

    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 flex w-full items-center justify-between gap-4 text-sm font-medium">
        {m.settings_sec_from_idp()}
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0}
          bind:value={() => samlMode, (next) => next && (samlMode = next as 'metadata' | 'manual')}
          aria-label={m.settings_sec_saml_config()}
        >
          <ToggleGroupItem value="metadata" class="h-6 px-2 text-xs">{m.settings_sec_metadata_xml()}</ToggleGroupItem>
          <ToggleGroupItem value="manual" class="h-6 px-2 text-xs">{m.settings_sec_manual()}</ToggleGroupItem>
        </ToggleGroup>
      </legend>
      {#if samlMode === 'metadata'}
        <Field
          id="sso-samlMetadata"
          label={m.settings_sec_idp_metadata_xml()}
          error={fieldError('samlMetadata')}
          hint={keepingSamlMetadata
            ? m.settings_sec_keep_metadata()
            : m.settings_sec_metadata_hint()}
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
        <Field id="sso-samlEntryPoint" label={m.settings_sec_sso_url()} error={fieldError('samlEntryPoint')}>
          <Input
            id="sso-samlEntryPoint"
            placeholder={'https://acme.okta.com/app/…/sso/saml'}
            bind:value={() => values.samlEntryPoint, (v) => setValue('samlEntryPoint', v)}
            {...invalid('samlEntryPoint')}
          />
        </Field>
        <Field
          id="sso-samlCert"
          label={m.settings_sec_x509()}
          error={fieldError('samlCert')}
          hint={provider?.saml?.hasCert ? m.settings_sec_keep_cert() : undefined}
        >
          <Textarea
            id="sso-samlCert"
            rows={4}
            spellcheck={false}
            class="font-mono text-xs"
            placeholder={'-----BEGIN CERTIFICATE-----'}
            bind:value={() => values.samlCert, (v) => setValue('samlCert', v)}
            {...invalid('samlCert')}
          />
        </Field>
      {/if}
      <Field
        id="sso-samlIssuer"
        label={m.settings_sec_idp_issuer()}
        error={fieldError('samlIssuer')}
        hint={samlMode === 'metadata' ? m.settings_sec_issuer_optional() : undefined}
      >
        <Input
          id="sso-samlIssuer"
          placeholder={'http://www.okta.com/exk…'}
          bind:value={() => values.samlIssuer, (v) => setValue('samlIssuer', v)}
          {...invalid('samlIssuer')}
        />
      </Field>
    </fieldset>
  {:else}
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-sm font-medium">{m.settings_sec_give_this_idp()}</legend>
      <Field id="sso-redirect" label={m.settings_sec_redirect_field()}>
        <CopyField id="sso-redirect" value={urls.oidcRedirectUri} label={m.settings_sec_redirect_uri()} />
      </Field>
    </fieldset>
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-sm font-medium">{m.settings_sec_from_idp()}</legend>
      <Field id="sso-oidcIssuer" label={m.settings_sec_issuer_url()} error={fieldError('oidcIssuer')} hint={m.settings_sec_issuer_hint()}>
        <Input
          id="sso-oidcIssuer"
          placeholder={'https://acme.okta.com or https://keycloak.acme.com/realms/acme'}
          bind:value={() => values.oidcIssuer, (v) => setValue('oidcIssuer', v)}
          {...invalid('oidcIssuer')}
        />
      </Field>
      <Field id="sso-oidcClientId" label={m.settings_sec_client_id()} error={fieldError('oidcClientId')}>
        <Input
          id="sso-oidcClientId"
          autocomplete="off"
          bind:value={() => values.oidcClientId, (v) => setValue('oidcClientId', v)}
          {...invalid('oidcClientId')}
        />
      </Field>
      <Field
        id="sso-oidcClientSecret"
        label={m.settings_sec_client_secret()}
        error={fieldError('oidcClientSecret')}
        hint={provider?.oidc?.hasSecret ? m.settings_sec_keep_secret() : undefined}
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
      <Button type="button" variant="ghost" onclick={onCancel}>{m.common_cancel()}</Button>
    {/if}
    <Button type="submit" disabled={pending}>
      {#if pending}<Loader2Icon class="animate-spin" />{/if}
      {provider ? m.common_save_changes() : m.settings_sec_save_turn_on()}
    </Button>
  </div>
</form>
