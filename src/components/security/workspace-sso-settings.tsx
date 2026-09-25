'use client';

// Workspace → Security → Single sign-on. One IdP (SAML 2.0 or OIDC) per
// workspace for one email domain; the service-provider URLs are fixed per
// workspace, so they're shown before anything is saved (IdP setup needs them).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import {
  removeWorkspaceSso,
  saveWorkspaceSso,
  setSsoEnforced,
  type SaveSsoInput,
  type SecurityField,
} from '@/app/actions/security';
import { CopyField } from '@/components/integrations/copy-field';
import { Field } from '@/components/settings/field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState, LabelChip } from '@/components/ui-icons';
import { SetupNotes } from './setup-notes';

type Protocol = 'saml' | 'oidc';

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

export function WorkspaceSsoSettings({
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
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [enforced, setEnforced] = useState(initialEnforced);
  const [pending, startTransition] = useTransition();

  function toggleEnforced(next: boolean) {
    setEnforced(next);
    startTransition(async () => {
      const result = await setSsoEnforced({ workspaceId, enforced: next });
      if (result.ok) {
        toast.success(next ? 'SSO is now required' : 'SSO is no longer required');
        router.refresh();
      } else {
        setEnforced(!next);
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeWorkspaceSso({ workspaceId });
      if (result.ok) {
        toast.success('Single sign-on removed');
        setEnforced(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  const showForm = editing || !provider;

  return (
    <div className="flex flex-col gap-4">
      {provider && !editing && (
        <div className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          >
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              @{provider.domain}
              <LabelChip color="done">{provider.protocol === 'saml' ? 'SAML' : 'OIDC'}</LabelChip>
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground" title={provider.issuer}>
              {provider.issuer}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ssoMemberCount === 0
                ? 'No members have signed in with SSO yet.'
                : `${ssoMemberCount} ${ssoMemberCount === 1 ? 'member has' : 'members have'} signed in with SSO.`}{' '}
              Existing accounts link on first SSO sign-in; a password set up without a verified
              email is removed then.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setRemoving(true)}
          >
            Remove
          </Button>
        </div>
      )}

      {provider && !editing && (
        <div className="flex items-start justify-between gap-6 rounded-lg border border-border px-4 py-3">
          <div>
            <Label htmlFor="sso-enforced" className="text-sm font-medium">
              Require SSO for @{provider.domain}
            </Label>
            <p className="mt-0.5 text-sm text-muted-foreground">
              People with @{provider.domain} emails can’t sign in or sign up with a password or
              GitHub — only through your identity provider.
            </p>
          </div>
          <Switch
            id="sso-enforced"
            checked={enforced}
            disabled={pending}
            onCheckedChange={toggleEnforced}
          />
        </div>
      )}

      {!provider && !editing && (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-6"
          icon={<KeyRound />}
          title="Single sign-on is off"
          description="Connect Okta, Microsoft Entra, Google Workspace, Keycloak or any SAML 2.0 / OIDC identity provider below."
        />
      )}

      {showForm && (
        <SsoForm
          workspaceId={workspaceId}
          provider={provider}
          urls={urls}
          txtRecord={txtRecord}
          proofOptional={proofOptional}
          suggestedDomain={suggestedDomain}
          onCancel={provider ? () => setEditing(false) : undefined}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={removing} onOpenChange={setRemoving}>
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
            <AlertDialogAction variant="destructive" onClick={remove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SsoForm({
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
}) {
  const [protocol, setProtocol] = useState<Protocol>(provider?.protocol ?? 'saml');
  const [domain, setDomain] = useState(provider?.domain ?? '');
  const [samlMode, setSamlMode] = useState<'metadata' | 'manual'>(
    provider?.saml && !provider.saml.hasMetadata ? 'manual' : 'metadata',
  );
  const [values, setValues] = useState({
    samlMetadata: '',
    samlEntryPoint: provider?.saml?.entryPoint ?? '',
    samlIssuer: provider?.protocol === 'saml' ? provider.issuer : '',
    samlCert: '',
    oidcIssuer: provider?.protocol === 'oidc' ? provider.issuer : '',
    oidcClientId: provider?.oidc?.clientId ?? '',
    oidcClientSecret: '',
  });
  const [error, setError] = useState<{ field?: SecurityField; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }));
    if (error?.field === key) setError(null);
  };
  const fieldError = (field: SecurityField) => (error?.field === field ? error.message : undefined);
  const invalid = (field: SecurityField) => ({
    'aria-invalid': error?.field === field,
    'aria-describedby': error?.field === field ? `sso-${field}-error` : undefined,
  });

  function submit(e: React.FormEvent) {
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
    startTransition(async () => {
      const result = await saveWorkspaceSso(input);
      if (result.ok) {
        toast.success(provider ? 'Single sign-on updated' : 'Single sign-on is set up');
        onSaved();
      } else {
        setError({ field: result.field, message: result.error });
        if (!result.field) toast.error(result.error);
      }
    });
  }

  const domainPreview = domain.trim().replace(/^@/, '') || suggestedDomain || 'acme.com';
  const keepingSamlMetadata = provider?.saml?.hasMetadata && samlMode === 'metadata';

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-6 rounded-lg border border-border px-4 py-4"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{provider ? 'Edit identity provider' : 'Connect an identity provider'}</p>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0}
          variant="outline"
          value={protocol}
          onValueChange={(next) => next && setProtocol(next as Protocol)}
          aria-label="Protocol"
        >
          <ToggleGroupItem value="saml" className="h-7 px-2.5 text-xs">
            SAML 2.0
          </ToggleGroupItem>
          <ToggleGroupItem value="oidc" className="h-7 px-2.5 text-xs">
            OpenID Connect
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Field
        id="sso-domain"
        label="Email domain"
        error={fieldError('domain')}
        hint="People with this email domain (and its subdomains) sign in through this provider."
      >
        <Input
          id="sso-domain"
          placeholder={suggestedDomain || 'acme.com'}
          value={domain}
          autoComplete="off"
          onChange={(e) => {
            setDomain(e.target.value);
            if (error?.field === 'domain') setError(null);
          }}
          {...invalid('domain')}
        />
      </Field>

      <div className="flex flex-col gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Domain verification.</span>{' '}
          {proofOptional
            ? 'Skipped in development. In production, prove the domain with this DNS record (or save from an admin account whose verified email is on it):'
            : 'Add this DNS TXT record, or save from an admin account whose verified email is on the domain:'}
        </p>
        <p className="font-mono">
          {txtRecord.label}.{domainPreview} TXT
        </p>
        <CopyField value={txtRecord.value} label="TXT value" />
      </div>

      {protocol === 'saml' ? (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Give these to your identity provider</legend>
            <Field id="sso-acs" label="ACS (reply) URL">
              <CopyField id="sso-acs" value={urls.acsUrl} label="ACS URL" />
            </Field>
            <Field id="sso-entity" label="SP entity ID / audience">
              <CopyField id="sso-entity" value={urls.spEntityId} label="Entity ID" />
            </Field>
            <p className="text-xs text-muted-foreground">
              Name ID format: email address. Service provider metadata is served at the entity ID
              URL once saved.
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 flex w-full items-center justify-between gap-4 text-sm font-medium">
              From your identity provider
              <ToggleGroup
                type="single"
                size="sm"
                spacing={0}
                value={samlMode}
                onValueChange={(next) => next && setSamlMode(next as 'metadata' | 'manual')}
                aria-label="SAML configuration"
              >
                <ToggleGroupItem value="metadata" className="h-6 px-2 text-xs">
                  Metadata XML
                </ToggleGroupItem>
                <ToggleGroupItem value="manual" className="h-6 px-2 text-xs">
                  Manual
                </ToggleGroupItem>
              </ToggleGroup>
            </legend>
            {samlMode === 'metadata' ? (
              <Field
                id="sso-samlMetadata"
                label="IdP metadata XML"
                error={fieldError('samlMetadata')}
                hint={
                  keepingSamlMetadata
                    ? 'Leave blank to keep the saved metadata.'
                    : 'Okta: Sign On → Metadata URL (open it and copy). Keycloak: realm → Endpoints → SAML 2.0 Identity Provider Metadata.'
                }
              >
                <Textarea
                  id="sso-samlMetadata"
                  rows={5}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder={'<md:EntityDescriptor entityID="…">'}
                  value={values.samlMetadata}
                  onChange={set('samlMetadata')}
                  {...invalid('samlMetadata')}
                />
              </Field>
            ) : (
              <>
                <Field id="sso-samlEntryPoint" label="SSO URL" error={fieldError('samlEntryPoint')}>
                  <Input
                    id="sso-samlEntryPoint"
                    placeholder="https://acme.okta.com/app/…/sso/saml"
                    value={values.samlEntryPoint}
                    onChange={set('samlEntryPoint')}
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
                    spellCheck={false}
                    className="font-mono text-xs"
                    placeholder="-----BEGIN CERTIFICATE-----"
                    value={values.samlCert}
                    onChange={set('samlCert')}
                    {...invalid('samlCert')}
                  />
                </Field>
              </>
            )}
            <Field
              id="sso-samlIssuer"
              label="IdP entity ID (issuer)"
              error={fieldError('samlIssuer')}
              hint={samlMode === 'metadata' ? 'Optional — read from the metadata.' : undefined}
            >
              <Input
                id="sso-samlIssuer"
                placeholder="http://www.okta.com/exk…"
                value={values.samlIssuer}
                onChange={set('samlIssuer')}
                {...invalid('samlIssuer')}
              />
            </Field>
          </fieldset>
        </>
      ) : (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Give this to your identity provider</legend>
            <Field id="sso-redirect" label="Redirect (callback) URI">
              <CopyField id="sso-redirect" value={urls.oidcRedirectUri} label="Redirect URI" />
            </Field>
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">From your identity provider</legend>
            <Field
              id="sso-oidcIssuer"
              label="Issuer URL"
              error={fieldError('oidcIssuer')}
              hint="Endpoints are discovered from /.well-known/openid-configuration."
            >
              <Input
                id="sso-oidcIssuer"
                placeholder="https://acme.okta.com or https://keycloak.acme.com/realms/acme"
                value={values.oidcIssuer}
                onChange={set('oidcIssuer')}
                {...invalid('oidcIssuer')}
              />
            </Field>
            <Field id="sso-oidcClientId" label="Client ID" error={fieldError('oidcClientId')}>
              <Input
                id="sso-oidcClientId"
                autoComplete="off"
                value={values.oidcClientId}
                onChange={set('oidcClientId')}
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
                autoComplete="new-password"
                placeholder={provider?.oidc?.hasSecret ? '••••••••' : undefined}
                value={values.oidcClientSecret}
                onChange={set('oidcClientSecret')}
                {...invalid('oidcClientSecret')}
              />
            </Field>
          </fieldset>
        </>
      )}

      <SetupNotes protocol={protocol} />

      {error && !error.field && <p className="text-sm text-destructive">{error.message}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {provider ? 'Save changes' : 'Save and turn on'}
        </Button>
      </div>
    </form>
  );
}
