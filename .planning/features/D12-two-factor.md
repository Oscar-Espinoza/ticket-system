# D12 — Two-factor authentication (TOTP) + active sessions

## Goal
Password accounts can require a TOTP code (authenticator app) or a one-time
backup code at sign-in, like Linear. Users see and revoke their active sessions.

## UX
- **Settings → Security** (`/dashboard/settings/security`):
  - *Two-factor authentication* card. Off → "Enable" opens a 3-step dialog:
    1. confirm password → `authClient.twoFactor.enable({ password })`;
    2. add to authenticator: secret (grouped, copy), `otpauth://` URI (copy +
       "Open in authenticator app" link for phones) — no QR encoder (brief:
       no new package; manual entry works in every app), enter first 6-digit
       code → `twoFactor.verifyTotp({ code })` flips `twoFactorEnabled`;
    3. backup codes shown once: copy all / download `.txt`.
  - On → "Enabled" chip, *Regenerate backup codes* (password → new codes,
    shown once), *Disable* (password).
  - GitHub/SSO-only accounts (no `credential` row): 2FA only guards password
    sign-in, so the card explains that their provider's 2FA applies.
  - *Sessions* list: device (parsed user agent), IP, last active, "This
    device" marker; revoke one / "Sign out other sessions".
- **`/login/two-factor`** (twoFactorClient redirects here, keeping `?redirect=`):
  6-digit code field (auto-submit at 6 digits), "Use a backup code" toggle,
  "Trust this device for 30 days" checkbox. Expired 2FA cookie → "start
  again" link to `/login`.
- Login form: a `twoFactorRedirect` response stops the normal push so the
  plugin's redirect wins.

## Data / actions
- Better Auth `twoFactor` plugin tables (`two_factor`, `user.two_factor_enabled`).
- `src/app/actions/security.ts`: `revokeSession({ sessionId })`,
  `revokeOtherSessions()` — tokens never reach the client; the action maps
  id → token scoped to the session user, then calls `auth.api.revokeSession`.
- Audit: `databaseHooks.user.update.after` in `auth.ts` records
  `security.2fa_enabled` / `security.2fa_disabled` (path-gated to the
  two-factor endpoints) and `hooks.after` records
  `security.2fa_backup_codes_regenerated` via `src/lib/audit.ts`.

## Files
`src/app/dashboard/settings/security/page.tsx`,
`src/components/security/two-factor-settings.tsx`, `sessions-list.tsx`,
`backup-codes.tsx`, `src/app/(auth)/login/two-factor/{page,two-factor-form}.tsx`,
`src/app/(auth)/login/login-form.tsx`, `src/app/actions/security.ts`, `src/lib/auth.ts`.

## Edge cases
- Cookie cache (5 min) means a revoked session can linger ≤ 5 min — said in the UI.
- The page reads `twoFactorEnabled` from the DB, not the (cached) session.
- Rate limit: Better Auth limits `/two-factor/*` to 3 req / 10 s in production.
- Cancelling mid-setup leaves an unverified secret; re-enabling replaces it.
