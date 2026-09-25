import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { userProfiles } from '@/db/schema';
import { getSession } from '@/lib/session';
import { NotificationPrefsForm } from '@/components/inbox/notification-prefs-form';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const [profile] = await db
    .select({
      emailNotifications: userProfiles.emailNotifications,
      prefs: userProfiles.notificationPrefs,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);

  return (
    <>
      <h1 className="text-xl font-medium">Notifications</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Choose what lands in your inbox and whether it also emails you.
      </p>
      <NotificationPrefsForm
        email={session.user.email}
        emailEnabled={profile?.emailNotifications ?? true}
        prefs={profile?.prefs ?? {}}
      />
    </>
  );
}
