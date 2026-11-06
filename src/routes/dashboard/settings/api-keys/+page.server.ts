// Personal API keys for the public REST API. See docs/API.md.

import { getActiveApiKeys } from '@/lib/account-settings-read';
import { appUrl } from '@/lib/integrations/app-url';
import type { ApiKeyView } from '@/lib/actions/api-keys';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();

  const keys = await getActiveApiKeys(user.id);

  return {
    appUrl: appUrl(),
    keys: keys.map(
      (key): ApiKeyView => ({
        ...key,
        createdAt: key.createdAt.toISOString(),
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      }),
    ),
  };
};
