import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pushSubscriptions, userProfiles } from '@/db/schema';
import { getSession } from '@/lib/session';
import { pushConfigured, vapidPublicKey } from '@/lib/push';
import { isDigestFrequency } from '@/lib/notifications/types';
import { NotificationPrefsForm } from '@/components/inbox/notification-prefs-form';
import { PushSettings } from '@/components/pwa/push-settings';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const [[profile], devices] = await Promise.all([
    db
      .select({
        emailNotifications: userProfiles.emailNotifications,
        prefs: userProfiles.notificationPrefs,
        digest: userProfiles.digestFrequency,
        push: userProfiles.pushNotifications,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id))
      .limit(1),
    db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        userAgent: pushSubscriptions.userAgent,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, session.user.id))
      .orderBy(desc(pushSubscriptions.createdAt)),
  ]);

  const configured = pushConfigured();
  const digest = profile?.digest;

  return (
    <>
      <h1 className="text-xl font-medium">Notifications</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Choose what lands in your inbox and how else it reaches you.
      </p>
      <NotificationPrefsForm
        email={session.user.email}
        emailEnabled={profile?.emailNotifications ?? true}
        digest={isDigestFrequency(digest) ? digest : 'off'}
        prefs={profile?.prefs ?? {}}
        pushSection={
          <PushSettings
            configured={configured}
            // Read at request time, so setting the env var needs no rebuild of client code.
            publicKey={configured ? vapidPublicKey() : null}
            enabled={profile?.push ?? true}
            devices={devices.map((device) => ({ ...device, createdAt: device.createdAt.toISOString() }))}
          />
        }
      />
    </>
  );
}
