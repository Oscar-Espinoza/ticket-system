// Account profile: the Better Auth user row (name, avatar) plus the app's
// user_profile row (title, bio, timezone). The session decides whose profile
// changes — no user id is ever read from the form.

import { headers } from '@/lib/kit/request';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { userProfiles } from '@/db/schema';
import { formField as field, refreshesData } from '@/lib/server/action-kit';
import { getSession } from '@/lib/session';
import { nameRuleMessage, validUserName } from '@/lib/auth-rules';
import { m, toAppLocale } from '@/lib/i18n';

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
  const session = await getSession();
  if (!session?.user) return { errors: { server: m.error_not_authenticated() } };

  const name = field(formData, 'name');
  const image = field(formData, 'image');
  const title = field(formData, 'title');
  const bio = field(formData, 'bio');
  const timezone = field(formData, 'timezone');

  const errors: NonNullable<ProfileState['errors']> = {};
  if (!name) errors.name = m.settings_err_name_required();
  else if (!validUserName(name)) errors.name = nameRuleMessage();
  // Only http(s): the value lands in <img src> for every teammate.
  if (image && (image.length > 2048 || !isHttpUrl(image))) {
    errors.image = m.settings_err_image_url();
  }
  if (title.length > 100) errors.title = m.settings_err_title_max();
  if (bio.length > 1000) errors.bio = m.settings_err_bio_max();
  if (timezone && !isTimeZone(timezone)) errors.timezone = m.settings_err_timezone();
  if (Object.keys(errors).length > 0) return { errors };

  // Through Better Auth (not a raw UPDATE) so it rewrites the session cookie
  // cache — otherwise the sidebar would show the old name for up to 5 minutes.
  if (name !== session.user.name || (image || null) !== (session.user.image ?? null)) {
    try {
      await auth.api.updateUser({
        body: { name, image: image || null },
        headers: await headers(),
      });
    } catch {
      return { errors: { server: m.settings_err_update_account() } };
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

  refreshesData();
  return { success: true };
}

/**
 * Interface language: 'en' | 'es', or null to follow the browser
 * (Accept-Language). Through Better Auth's updateUser so the session cookie
 * cache — which the language hook reads (src/lib/server/i18n.ts) — follows at
 * once. The browser reloads after this (language-form.svelte).
 */
export async function updateLanguage(locale: string | null): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: m.error_not_authenticated() };
  const value = locale === null ? null : toAppLocale(locale);
  if (locale !== null && !value) return { ok: false, error: m.settings_language_unknown() };
  try {
    await auth.api.updateUser({ body: { locale: value }, headers: await headers() });
  } catch {
    return { ok: false, error: m.settings_language_save_failed() };
  }
  return { ok: true };
}
