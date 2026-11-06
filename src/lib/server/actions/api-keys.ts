// Personal API keys. Scoped to the session user: a key id belonging to someone
// else is "not found". The plaintext key is returned once, from createApiKey.

import { and, count, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { apiKeys } from '@/db/schema';
import { getSession } from '@/lib/session';
import { generateApiKey } from '@/lib/api-auth';
import {
  fail,
  isFail,
  NOT_AUTHENTICATED,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const NAME_MAX = 60;
const KEYS_MAX = 25;

export async function createApiKey(input: {
  name: string;
}): Promise<ActionResult<{ apiKey: ApiKeyView; key: string }, 'name'>> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  const userId = session.user.id;

  const name = requiredText(input?.name, 'name', NAME_MAX);
  if (isFail(name)) return name;

  const [{ total }] = await db
    .select({ total: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
  if (total >= KEYS_MAX) {
    return fail(`You can have at most ${KEYS_MAX} active keys. Revoke one first.`);
  }

  const { key, prefix, hash } = generateApiKey();
  const createdAt = new Date();
  const id = crypto.randomUUID();
  await db.insert(apiKeys).values({ id, userId, name, prefix, keyHash: hash, createdAt });

  refreshesData();
  return {
    ok: true,
    key,
    apiKey: { id, name, prefix, createdAt: createdAt.toISOString(), lastUsedAt: null },
  };
}

export async function revokeApiKey(input: { id: string }): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  if (typeof input?.id !== 'string') return fail('Key not found.');

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
  if (!row) return fail('Key not found.');

  refreshesData();
  return { ok: true };
}
