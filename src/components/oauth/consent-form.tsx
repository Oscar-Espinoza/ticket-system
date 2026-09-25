'use client';

import { useState } from 'react';
import { Check, Loader2, TriangleAlert } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { Avatar } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AppIcon } from './app-icon';
import { describeScope } from './oauth-model';

interface ConsentApp {
  name: string;
  icon: string | null;
  uri: string | null;
  policy: string | null;
  tos: string | null;
}

/** openid is implied by any sign-in; don't list it as a separate permission. */
const HIDDEN_SCOPES = new Set(['openid']);

function safeHref(uri: string | null): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ConsentForm({
  app,
  scopes,
  user,
  redirectHost,
}: {
  app: ConsentApp | null;
  scopes: string[];
  user: { name: string; email: string; image: string | null };
  redirectHost: string | null;
}) {
  const [pending, setPending] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    setPending(accept ? 'allow' : 'deny');
    setError(null);
    // The oauth-provider client plugin adds the page's signed query (oauth_query).
    const { data, error: failure } = await authClient.$fetch<{ url?: string; redirect_uri?: string }>(
      '/oauth2/consent',
      { method: 'POST', body: { accept } },
    );
    const target = data?.url ?? data?.redirect_uri;
    if (failure || !target) {
      setPending(null);
      setError('This authorization request expired or is invalid. Start again from the app.');
      return;
    }
    window.location.assign(target);
  }

  if (!app) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-amber-500" />
            Invalid authorization request
          </CardTitle>
          <CardDescription>
            The link expired or the app no longer exists. Go back to the app and try connecting again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const visible = scopes.filter((s) => !HIDDEN_SCOPES.has(s));
  const homepage = safeHref(app.uri);
  const policy = safeHref(app.policy);
  const tos = safeHref(app.tos);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <AppIcon name={app.name} src={app.icon} size="lg" className="mx-auto" />
        <CardTitle className="mt-3 text-base">
          {homepage ? (
            <a href={homepage} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
              {app.name}
            </a>
          ) : (
            app.name
          )}{' '}
          wants to access your account
        </CardTitle>
        <CardDescription className="flex items-center justify-center gap-2">
          <Avatar name={user.name} src={user.image} size={20} />
          <span className="truncate">{user.email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs font-medium text-muted-foreground">This will allow it to:</p>
        <ul className="flex flex-col gap-2 text-sm">
          {(visible.length ? visible : ['openid']).map((scope) => (
            <li key={scope} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              {describeScope(scope)}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-4 text-xs text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={pending !== null}
            onClick={() => answer(false)}
          >
            {pending === 'deny' && <Loader2 className="animate-spin" />}
            Deny
          </Button>
          <Button className="flex-1" disabled={pending !== null} onClick={() => answer(true)} autoFocus>
            {pending === 'allow' && <Loader2 className="animate-spin" />}
            Allow
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {redirectHost ? (
            <>
              You’ll be sent to <span className="font-medium text-foreground">{redirectHost}</span>.{' '}
            </>
          ) : null}
          Revoke access anytime in Settings → OAuth apps.
          {(policy || tos) && (
            <>
              {' '}
              {policy && (
                <a href={policy} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                  Privacy
                </a>
              )}
              {policy && tos && ' · '}
              {tos && (
                <a href={tos} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                  Terms
                </a>
              )}
            </>
          )}
        </p>
      </CardFooter>
    </Card>
  );
}
