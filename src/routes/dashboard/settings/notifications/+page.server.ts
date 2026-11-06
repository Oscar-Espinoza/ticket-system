// Account settings › Notifications.

import { getNotificationSettings } from '@/lib/account-settings-read';
import { isDigestFrequency } from '@/lib/notifications/types';
import { pushConfigured, vapidPublicKey } from '@/lib/push';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();

  const { profile, devices } = await getNotificationSettings(user.id);

  const configured = pushConfigured();
  const digest = profile?.digest;

  return {
    email: user.email,
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
