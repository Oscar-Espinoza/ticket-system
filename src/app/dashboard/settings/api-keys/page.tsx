// Personal API keys for the public REST API (B11). See docs/API.md.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { apiKeys } from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';
import { ApiKeySettings } from '@/components/integrations/api-key-settings';

export const metadata: Metadata = { title: 'API keys' };

export default async function ApiKeysSettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, session.user.id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));

  return (
    <>
      <h1 className="text-xl font-medium">API keys</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Personal keys for the REST API at{' '}
        <span className="font-mono text-xs">{appUrl()}/api/v1</span>. Send them as{' '}
        <span className="font-mono text-xs">Authorization: Bearer lc_…</span>.
      </p>
      <ApiKeySettings
        keys={keys.map((key) => ({
          ...key,
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
