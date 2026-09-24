import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { accounts, userProfiles } from '@/db/schema';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { Separator } from '@/components/ui/separator';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const { user } = session;

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

  return (
    <>
      <h1 className="text-xl font-medium">Profile</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        How you appear to teammates across every project.
      </p>

      <ProfileForm
        email={user.email}
        name={user.name}
        image={user.image ?? ''}
        title={profile?.title ?? ''}
        bio={profile?.bio ?? ''}
        timezone={profile?.timezone ?? ''}
        timezones={Intl.supportedValuesOf('timeZone')}
      />

      <Separator className="my-10" />

      <h2 className="text-base font-medium">Password</h2>
      {credential ? (
        <PasswordForm />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          You sign in with GitHub, so there is no password to change.
        </p>
      )}
    </>
  );
}
