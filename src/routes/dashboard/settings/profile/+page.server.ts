// Account settings › Profile.

import { getProfileSettings } from '@/lib/account-settings-read';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();

  const { profile, hasPassword } = await getProfileSettings(user.id);

  return {
    profile: {
      email: user.email,
      name: user.name,
      image: user.image ?? '',
      title: profile?.title ?? '',
      bio: profile?.bio ?? '',
      timezone: profile?.timezone ?? '',
      timezones: Intl.supportedValuesOf('timeZone'),
    },
    hasPassword,
  };
};
