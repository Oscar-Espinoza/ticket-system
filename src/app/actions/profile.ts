'use server';

// Account profile: the Better Auth user row (name, avatar) plus the app's
// user_profile row (title, bio, timezone). The session decides whose profile
// changes — no user id is ever read from the form.

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userProfiles } from '@/db/schema';

export type ProfileState = {
  errors?: {
    name?: string;
    image?: string;
    title?: string;
    bio?: string;
    timezone?: string;
    server?: string;
  };
  success?: boolean;
};

const field = (formData: FormData, key: string) =>
  ((formData.get(key) as string | null) ?? '').trim();

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) return { errors: { server: 'Not authenticated' } };

  const name = field(formData, 'name');
  const image = field(formData, 'image');
  const title = field(formData, 'title');
  const bio = field(formData, 'bio');
  const timezone = field(formData, 'timezone');

  const errors: NonNullable<ProfileState['errors']> = {};
  if (!name) errors.name = 'Name is required.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';
  // Only http(s): the value lands in <img src> for every teammate.
  if (image && (image.length > 2048 || !isHttpUrl(image))) {
    errors.image = 'Enter an http(s) image URL.';
  }
  if (title.length > 100) errors.title = 'Title must be 100 characters or fewer.';
  if (bio.length > 1000) errors.bio = 'Bio must be 1000 characters or fewer.';
  if (timezone && !isTimeZone(timezone)) errors.timezone = 'Unknown timezone.';
  if (Object.keys(errors).length > 0) return { errors };

  // Through Better Auth (not a raw UPDATE) so it rewrites the session cookie
  // cache — otherwise the sidebar would show the old name for up to 5 minutes.
  if (name !== session.user.name || (image || null) !== (session.user.image ?? null)) {
    try {
      await auth.api.updateUser({
        body: { name, image: image || null },
        headers: requestHeaders,
      });
    } catch {
      return { errors: { server: 'Could not update your account. Try again.' } };
    }
  }

  const now = new Date();
  const profile = {
    title: title || null,
    bio: bio || null,
    timezone: timezone || null,
    updatedAt: now,
  };
  await db
    .insert(userProfiles)
    .values({ userId: session.user.id, ...profile, createdAt: now })
    .onConflictDoUpdate({ target: userProfiles.userId, set: profile });

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}
