// OAuth apps: apps the user registered against our OAuth 2.0 provider, and third-party
// apps the user has authorized. See docs/API.md → OAuth.

import { getOAuthSettings } from '@/lib/account-settings-read';
import { appUrl } from '@/lib/integrations/app-url';
import { authorizedAppView, oauthAppView } from '@/lib/oauth-model';
import { requireUser } from '@/lib/session';
import { mcpUrl } from '@/lib/server/mcp/urls';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { id: userId } = await requireUser();

  const { apps, consents } = await getOAuthSettings(userId);

  return {
    origin: appUrl(),
    mcpUrl: mcpUrl(),
    apps: apps.map(oauthAppView),
    consents: consents.map(authorizedAppView),
  };
};
