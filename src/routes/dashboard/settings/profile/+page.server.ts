// Account settings › Profile.

import { and, eq } from 'drizzle-orm';

import { accounts, userProfiles } from '@/db/schema';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();

  const [[profile], [credential]] = await Promise.all([
    db
      .select({
        title: userProfiles.title,
        bio: userProfiles.bio,
        timezone: userProfiles.timezone,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1),
    // Password change only makes sense for email/password sign-ups; GitHub-only
    // accounts have no credential row (and no password to verify).
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')))
      .limit(1),
  ]);

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
    hasPassword: Boolean(credential),
  };
};
