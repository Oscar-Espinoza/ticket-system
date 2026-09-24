# A2 — Account settings (profile editing)

## Goal
`/dashboard/settings/*` with a left nav (Profile, Appearance, Notifications →
B2 stub, API keys → B11 stub). `/dashboard/settings` redirects to Profile.

## UX — Profile
- Email (read-only), Name, Avatar URL (with live avatar preview), Title, Bio,
  Timezone (select of `Intl.supportedValuesOf('timeZone')`, "Use browser
  timezone" helper). One Save button; toast on success; field errors inline.
- Change password card only when the user has a `credential` account: current,
  new (≥ 8), confirm. Revokes other sessions. GitHub-only users see a note.

## Data / actions — `src/app/actions/profile.ts`
`updateProfile(prev, formData)` (useActionState):
1. session required; 2. validate name (1–100), image (empty or http(s) URL,
≤ 2048), title ≤ 100, bio ≤ 1000, timezone valid IANA (`Intl.DateTimeFormat`
throws otherwise); 3. `auth.api.updateUser({ body: { name, image }, headers })`
— Better Auth rewrites the session cookie cache (nextCookies plugin) so the
sidebar name updates; 4. upsert `user_profile` (onConflictDoUpdate on user_id);
5. `revalidatePath('/dashboard', 'layout')`.
Password change: client `authClient.changePassword({ currentPassword,
newPassword, revokeOtherSessions: true })` — Better Auth verifies the current
password server-side and enforces min length.

## Files
`src/app/dashboard/settings/{layout,page}.tsx`, `settings/profile/page.tsx`,
`src/components/app-shell/settings-nav.tsx`,
`src/components/settings/{profile-form,password-form}.tsx`,
`src/app/actions/profile.ts`.

## Edge cases
No `user_profile` row yet → defaults (null). Empty avatar URL clears the image.
Better Auth errors surface as a server error string, never thrown to the UI.
