'use server';

// Personal API keys. Scoped to the session user: a key id belonging to someone
// else is "not found". The plaintext key is returned once, from createApiKey.

import { revalidatePath } from 'next/cache';
import { and, count, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { apiKeys } from '@/db/schema';
import { getSession } from '@/lib/session';
import { generateApiKey } from '@/lib/api-auth';

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: 'name' };

const NAME_MAX = 60;
const KEYS_MAX = 25;
const PAGE = '/dashboard/settings/api-keys';

export async function createApiKey(input: {
  name: string;
}): Promise<Result<{ apiKey: ApiKeyView; key: string }>> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: 'Not authenticated' };
  const userId = session.user.id;

  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: 'Name is required.', field: 'name' };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.`, field: 'name' };
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  if (total >= KEYS_MAX) {
    return { ok: false, error: `You can have at most ${KEYS_MAX} active keys. Revoke one first.` };
  }

  const { key, prefix, hash } = generateApiKey();
  const createdAt = new Date();
  const id = crypto.randomUUID();
  await db.insert(apiKeys).values({ id, userId, name, prefix, keyHash: hash, createdAt });

  revalidatePath(PAGE);
  return {
    ok: true,
    key,
    apiKey: { id, name, prefix, createdAt: createdAt.toISOString(), lastUsedAt: null },
  };
}

export async function revokeApiKey(input: { id: string }): Promise<Result> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.id !== 'string') return { ok: false, error: 'Key not found.' };

  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, input.id),
        eq(apiKeys.userId, session.user.id),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!row) return { ok: false, error: 'Key not found.' };

  revalidatePath(PAGE);
  return { ok: true };
}
