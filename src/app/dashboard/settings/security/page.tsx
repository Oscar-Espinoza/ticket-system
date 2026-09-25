// Settings → Security: two-factor authentication and active sessions.
// 2FA state is read from the DB — the session cookie cache can lag.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, desc, eq, gt } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { accounts, sessions, users } from '@/db/schema';
import { Separator } from '@/components/ui/separator';
import { SessionsList } from '@/components/security/sessions-list';
import { TwoFactorSettings } from '@/components/security/two-factor-settings';

export const metadata: Metadata = { title: 'Security' };

export default async function SecuritySettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

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

  const currentId = session.session.id;
  // Current session first, then by last activity.
  const ordered = [
    ...sessionRows.filter((s) => s.id === currentId),
    ...sessionRows.filter((s) => s.id !== currentId),
  ];

  return (
    <>
      <h1 className="text-xl font-medium">Security</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Protect your account and see where you’re signed in.
      </p>

      <h2 className="mb-3 text-base font-medium">Two-factor authentication</h2>
      <TwoFactorSettings enabled={user?.twoFactorEnabled === true} hasPassword={!!credential} />

      <Separator className="my-10" />

      <h2 className="mb-3 text-base font-medium">Sessions</h2>
      <SessionsList
        currentId={currentId}
        sessions={ordered.map((s) => ({
          id: s.id,
          userAgent: s.userAgent,
          ipAddress: s.ipAddress,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
