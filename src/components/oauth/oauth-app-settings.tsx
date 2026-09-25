'use client';

import { useState, useTransition } from 'react';
import { AppWindow, Copy, KeyRound, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { createOAuthApp, deleteOAuthApp, rotateOAuthAppSecret } from '@/app/actions/oauth-apps';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui-icons';
import { AppIcon } from './app-icon';
import { APP_NAME_MAX, REDIRECT_URIS_MAX, type OAuthAppView } from './oauth-model';

/** Credentials to show once: after create (id + secret) or rotate (secret). */
type Reveal = { app: OAuthAppView; secret: string | null; rotated: boolean };
type Confirm = { kind: 'rotate' | 'delete'; app: OAuthAppView } | null;

export function OAuthAppSettings({
  origin,
  apps: initial,
}: {
  origin: string;
  apps: OAuthAppView[];
}) {
  const [apps, setApps] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [, startTransition] = useTransition();

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Copy failed');
    }
  }

  function rotate(app: OAuthAppView) {
    startTransition(async () => {
      const result = await rotateOAuthAppSecret({ clientId: app.clientId });
      if (result.ok) setReveal({ app, secret: result.clientSecret, rotated: true });
      else toast.error(result.error);
    });
  }

  function remove(app: OAuthAppView) {
    startTransition(async () => {
      const result = await deleteOAuthApp({ clientId: app.clientId });
      if (result.ok) {
        setApps((prev) => prev.filter((a) => a.clientId !== app.clientId));
        toast.success(`Deleted ${app.name}`);
      } else toast.error(result.error);
    });
  }

  const registerButton = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus />
      Register app
    </Button>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Your apps</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Apps you built that other people can connect to their account.
          </p>
        </div>
        {apps.length > 0 && registerButton}
      </div>

      {apps.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-10"
          icon={<AppWindow />}
          title="No OAuth apps"
          description="Register an app to get a client ID for the OAuth authorization flow."
          action={registerButton}
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {apps.map((app) => (
            <li key={app.clientId} className="flex items-center gap-3 px-3 py-2.5">
              <AppIcon name={app.name} src={app.icon} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{app.name}</span>
                  <span className="shrink-0 rounded border border-border px-1 text-[0.65rem] font-normal text-muted-foreground uppercase">
                    {app.isPublic ? 'Public' : 'Confidential'}
                  </span>
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {app.clientId}
                  <span className="font-sans">
                    {' · '}
                    {app.redirectUris.length} redirect URI{app.redirectUris.length === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`${app.name} actions`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => copy(app.clientId, 'Client ID')}>
                    <Copy />
                    Copy client ID
                  </DropdownMenuItem>
                  {!app.isPublic && (
                    <DropdownMenuItem onSelect={() => setConfirm({ kind: 'rotate', app })}>
                      <KeyRound />
                      Rotate secret
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirm({ kind: 'delete', app })}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <RegisterAppDialog
          onClose={() => setCreating(false)}
          onCreated={(app, secret) => {
            setApps((prev) => [...prev, app]);
            setCreating(false);
            setReveal({ app, secret, rotated: false });
          }}
        />
      )}

      <Dialog open={!!reveal} onOpenChange={(open) => !open && setReveal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reveal?.rotated ? 'New client secret' : `${reveal?.app.name ?? 'App'} registered`}
            </DialogTitle>
            <DialogDescription>
              {reveal?.secret
                ? 'Copy the secret now — it is shown only once and only a hash is stored.'
                : 'Public apps have no secret: use PKCE (S256) on every authorization.'}
              {reveal?.rotated && ' The previous secret stopped working.'}
            </DialogDescription>
          </DialogHeader>
          {reveal && (
            <div className="flex flex-col gap-4">
              {!reveal.rotated && (
                <Field id="oauth-client-id" label="Client ID">
                  <CopyField id="oauth-client-id" value={reveal.app.clientId} label="Client ID" />
                </Field>
              )}
              {reveal.secret && (
                <Field id="oauth-client-secret" label="Client secret">
                  <CopyField id="oauth-client-secret" value={reveal.secret} label="Client secret" />
                </Field>
              )}
              {!reveal.rotated && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Authorize</dt>
                  <dd className="truncate font-mono">{origin}/api/auth/oauth2/authorize</dd>
                  <dt className="text-muted-foreground">Token</dt>
                  <dd className="truncate font-mono">{origin}/api/auth/oauth2/token</dd>
                  <dt className="text-muted-foreground">Scopes</dt>
                  <dd className="font-mono">read write offline_access</dd>
                </dl>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setReveal(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'rotate' ? 'Rotate client secret?' : `Delete ${confirm?.app.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'rotate'
                ? 'The current secret stops working immediately; update your app with the new one.'
                : 'Everyone who connected this app loses access and its tokens are revoked. This can’t be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === 'delete' ? 'destructive' : 'default'}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === 'rotate') rotate(confirm.app);
                else remove(confirm.app);
              }}
            >
              {confirm?.kind === 'rotate' ? 'Rotate' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function RegisterAppDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (app: OAuthAppView, secret: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [kind, setKind] = useState<'confidential' | 'public'>('confidential');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createOAuthApp({ name, redirectUris, homepageUrl, logoUrl, kind });
      if (result.ok) onCreated(result.app, result.clientSecret);
      else if (result.field) setErrors({ [result.field]: result.error });
      else toast.error(result.error);
    });
  }

  const clear = (field: string) => setErrors((prev) => ({ ...prev, [field]: undefined }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Register OAuth app</DialogTitle>
            <DialogDescription>
              People see the name and logo when they authorize your app.
            </DialogDescription>
          </DialogHeader>

          <Field id="oauth-name" label="Name" error={errors.name}>
            <Input
              id="oauth-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clear('name');
              }}
              maxLength={APP_NAME_MAX}
              autoFocus
              autoComplete="off"
              aria-invalid={!!errors.name}
            />
          </Field>

          <Field
            id="oauth-redirects"
            label="Redirect URIs"
            hint={`One per line, up to ${REDIRECT_URIS_MAX}. https, or http for localhost.`}
            error={errors.redirectUris}
          >
            <Textarea
              id="oauth-redirects"
              value={redirectUris}
              onChange={(e) => {
                setRedirectUris(e.target.value);
                clear('redirectUris');
              }}
              rows={3}
              spellCheck={false}
              placeholder="https://example.com/oauth/callback"
              className="font-mono text-xs"
              aria-invalid={!!errors.redirectUris}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="oauth-homepage" label="Homepage (optional)" error={errors.homepageUrl}>
              <Input
                id="oauth-homepage"
                value={homepageUrl}
                onChange={(e) => {
                  setHomepageUrl(e.target.value);
                  clear('homepageUrl');
                }}
                placeholder="https://example.com"
                autoComplete="off"
                aria-invalid={!!errors.homepageUrl}
              />
            </Field>
            <Field id="oauth-logo" label="Logo URL (optional)" error={errors.logoUrl}>
              <Input
                id="oauth-logo"
                value={logoUrl}
                onChange={(e) => {
                  setLogoUrl(e.target.value);
                  clear('logoUrl');
                }}
                placeholder="https://example.com/logo.png"
                autoComplete="off"
                aria-invalid={!!errors.logoUrl}
              />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">App type</legend>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <label className="flex items-start gap-2.5 text-sm">
                <RadioGroupItem value="confidential" className="mt-0.5" />
                <span>
                  Confidential
                  <span className="block text-xs text-muted-foreground">
                    A server that can keep a client secret.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <RadioGroupItem value="public" className="mt-0.5" />
                <span>
                  Public
                  <span className="block text-xs text-muted-foreground">
                    A single-page, desktop or mobile app — no secret, PKCE only.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !redirectUris.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              Register app
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
