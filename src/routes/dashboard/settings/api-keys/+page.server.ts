// Personal API keys for the public REST API. See docs/API.md.

import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { apiKeys } from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';
import type { ApiKeyView } from '@/lib/actions/api-keys';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));

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
