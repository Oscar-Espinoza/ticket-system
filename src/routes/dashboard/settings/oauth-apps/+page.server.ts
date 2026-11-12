// OAuth apps: apps the user registered against our OAuth 2.0 provider, and third-party
// apps the user has authorized. See docs/API.md → OAuth.

import { getOAuthSettings } from '@/lib/account-settings-read';
import { appUrl } from '@/lib/integrations/app-url';
import type { AuthorizedAppView, OAuthAppView } from '@/lib/oauth-model';
import { requireUser } from '@/lib/session';
import { mcpUrl } from '@/lib/server/mcp/urls';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { id: userId } = await requireUser();

  const { apps, consents } = await getOAuthSettings(userId);

  return {
    origin: appUrl(),
    mcpUrl: mcpUrl(),
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
