// Settings → Security: two-factor authentication and active sessions. 2FA state is read from the
// DB — the session cookie cache can lag.

import { and, desc, eq, gt } from 'drizzle-orm';

import { db } from '@/lib/db';
import { accounts, sessions, users } from '@/db/schema';
import type { SessionView } from '@/lib/components/security/sessions-list.svelte';
import { requireSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { user: viewer, session } = await requireSession();
  const userId = viewer.id;

  const [[user], [credential], sessionRows] = await db.batch([
    db
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
      .limit(1),
    db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.updatedAt))
      .limit(50),
  ]);

  const currentId = session.id;
  // Current session first, then by last activity.
  const ordered = [
    ...sessionRows.filter((s) => s.id === currentId),
    ...sessionRows.filter((s) => s.id !== currentId),
  ];

  return {
    twoFactorEnabled: user?.twoFactorEnabled === true,
    hasPassword: !!credential,
    currentId,
    sessions: ordered.map(
      (s): SessionView => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }),
    ),
  };
};
