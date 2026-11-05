// OAuth apps (D10a; port of src/app/dashboard/settings/oauth-apps/page.tsx):
// apps the user registered against our OAuth 2.0 provider, and third-party
// apps the user has authorized. See docs/API.md → OAuth.

import { redirect } from '@sveltejs/kit';
import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { oauthClients, oauthConsents } from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';
import type { AuthorizedAppView, OAuthAppView } from '@/components/oauth/oauth-model';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const userId = locals.user.id;

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

  return {
    origin: appUrl(),
    apps: apps.map(
      (app): OAuthAppView => ({
        clientId: app.clientId,
        name: app.name ?? 'Untitled app',
        icon: app.icon,
        uri: app.uri,
        redirectUris: app.redirectUris,
        isPublic: app.isPublic === true,
        createdAt: (app.createdAt ?? new Date(0)).toISOString(),
      }),
    ),
    consents: consents.map(
      (c): AuthorizedAppView => ({
        id: c.id,
        clientId: c.clientId,
        name: c.name ?? 'Untitled app',
        icon: c.icon,
        uri: c.uri,
        scopes: c.scopes,
        grantedAt: (c.grantedAt ?? new Date(0)).toISOString(),
      }),
    ),
  };
};
