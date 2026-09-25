# D10a — OAuth apps (OAuth 2.0 provider)

## Goal
Third-party apps act on behalf of a user without a personal API key, via the
authorization-code + PKCE flow of Better Auth's `@better-auth/oauth-provider`.

## UX
- `Settings → OAuth apps` (account settings):
  - "Your apps": register app dialog (name, redirect URIs one per line, logo URL,
    homepage, type Confidential (web server) / Public (SPA / native, PKCE, no secret)).
    After create: client id + secret shown once (CopyField). Row menu: Copy client id,
    Rotate secret (confirm → new secret shown once), Delete (AlertDialog).
  - "Authorized apps": consents granted by the user (app name/logo, scopes, date) with
    Revoke (deletes the consent and every access/refresh token of that app for the user).
- `/oauth/consent` (signed-in page; unauthenticated → `/login` keeps the signed query):
  app logo/name/homepage, the requested scopes in plain words, Allow / Deny →
  `authClient.oauth2.consent({accept})` which returns the redirect URL.

## Data / actions (`src/app/actions/oauth-apps.ts`)
- `createOAuthApp`, `rotateOAuthAppSecret`, `deleteOAuthApp` → `auth.api.createOAuthClient`
  / `rotateClientSecret` / `deleteOAuthClient` with the request headers (plugin checks
  ownership). Scope set `openid profile email offline_access read write`, grant types
  authorization_code + refresh_token, PKCE always required.
- `revokeOAuthConsent({id})`: consent must belong to the session user; deletes consent
  + tokens for (user, client).
- Reads for the page: `oauth_client where user_id = me`, `oauth_consent join oauth_client`.

## API auth
`authenticateApiRequest` accepts opaque OAuth access tokens: sha256/base64url lookup
in `oauth_access_token`, not expired, client not disabled, has a user; scopes returned
so REST (GET = read, others = write) and GraphQL (query = read, mutation = write)
enforce them. Tokens are opaque (no `resource` param → no JWT access tokens).

## Edge cases
Validation: 1–10 redirect URIs, https (http only for localhost), logo https URL;
max 20 apps per user. Secrets never stored in plain text (plugin hashes them).
Better Auth errors mapped to friendly messages. Consent page with a missing/expired
signature shows an error state.
