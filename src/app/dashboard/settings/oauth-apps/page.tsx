// OAuth apps (D10a): apps the user registered against our OAuth 2.0 provider,
// and third-party apps the user has authorized. See docs/API.md → OAuth.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { oauthClients, oauthConsents } from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';
import { AuthorizedApps } from '@/components/oauth/authorized-apps';
import { OAuthAppSettings } from '@/components/oauth/oauth-app-settings';
import { Separator } from '@/components/ui/separator';

export const metadata: Metadata = { title: 'OAuth apps' };

export default async function OAuthAppsSettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const [apps, consents] = await Promise.all([
    db
      .select({
        clientId: oauthClients.clientId,
        name: oauthClients.name,
        icon: oauthClients.icon,
        uri: oauthClients.uri,
        redirectUris: oauthClients.redirectUris,
        isPublic: oauthClients.public,
        createdAt: oauthClients.createdAt,
      })
      .from(oauthClients)
      .where(eq(oauthClients.userId, userId))
      .orderBy(asc(oauthClients.createdAt)),
    db
      .select({
        id: oauthConsents.id,
        clientId: oauthConsents.clientId,
        scopes: oauthConsents.scopes,
        grantedAt: oauthConsents.updatedAt,
        name: oauthClients.name,
        icon: oauthClients.icon,
        uri: oauthClients.uri,
      })
      .from(oauthConsents)
      .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
      .where(eq(oauthConsents.userId, userId))
      .orderBy(desc(oauthConsents.updatedAt)),
  ]);

  const origin = appUrl();
  return (
    <>
      <h1 className="text-xl font-medium">OAuth apps</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Let other apps act on your behalf through the REST and GraphQL APIs using OAuth 2.0
        (authorization code + PKCE). Authorize at{' '}
        <span className="font-mono text-xs">{origin}/api/auth/oauth2/authorize</span>.
      </p>
      <OAuthAppSettings
        origin={origin}
        apps={apps.map((app) => ({
          clientId: app.clientId,
          name: app.name ?? 'Untitled app',
          icon: app.icon,
          uri: app.uri,
          redirectUris: app.redirectUris,
          isPublic: app.isPublic === true,
          createdAt: (app.createdAt ?? new Date(0)).toISOString(),
        }))}
      />
      <Separator className="my-10" />
      <AuthorizedApps
        apps={consents.map((c) => ({
          id: c.id,
          clientId: c.clientId,
          name: c.name ?? 'Untitled app',
          icon: c.icon,
          uri: c.uri,
          scopes: c.scopes,
          grantedAt: (c.grantedAt ?? new Date(0)).toISOString(),
        }))}
      />
    </>
  );
}
