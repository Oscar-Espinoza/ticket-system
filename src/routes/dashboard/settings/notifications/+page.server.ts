// Account settings › Notifications (port of src/app/dashboard/settings/notifications/page.tsx).

import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';

import { pushSubscriptions, userProfiles } from '@/db/schema';
import { db } from '@/lib/db';
import { isDigestFrequency } from '@/lib/notifications/types';
import { pushConfigured, vapidPublicKey } from '@/lib/push';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');

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

  return {
    email: session.user.email,
    emailEnabled: profile?.emailNotifications ?? true,
    digest: isDigestFrequency(digest) ? digest : ('off' as const),
    prefs: profile?.prefs ?? {},
    push: {
      configured,
      // Read at request time, so setting the env var needs no rebuild of client code.
      publicKey: configured ? vapidPublicKey() : null,
      enabled: profile?.push ?? true,
      devices: devices.map((device) => ({ ...device, createdAt: device.createdAt.toISOString() })),
    },
  };
};
