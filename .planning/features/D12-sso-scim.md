# D12 — SAML / OIDC SSO + SCIM provisioning

## Goal
Workspace owners/admins connect their identity provider for one email domain,
optionally enforce it, and provision/deprovision members with SCIM. $0: works
with Okta Developer, Keycloak (self-hosted) or any SAML 2.0 / OIDC IdP.

## UX — `/dashboard/workspaces/[slug]/security` (owner/admin; members see a note)
- **Single sign-on**: protocol toggle (SAML | OIDC); email domain; SAML: IdP
  metadata XML *or* SSO URL + IdP entity ID + X.509 cert; OIDC: issuer, client
  id, client secret (blank on edit = keep). Copy boxes: ACS URL, SP entity ID /
  metadata URL, OIDC redirect URI. Domain proof: admin's verified email is on
  the domain, or DNS TXT `_ticket-system.<domain>` =
  `ticket-system-verification=<hmac(workspaceId)>` (skipped outside
  production for local IdPs). Remove (confirm). **Enforce SSO** switch — needs
  the admin to have signed in with SSO once when their own email is on the
  domain (lock-out guard).
- **SCIM**: base URL `…/api/auth/scim/v2`, generate / rotate token (shown once),
  revoke. Collapsible Okta + Keycloak setup notes.
- **Login page**: "Continue with SSO" → email → `authClient.signIn.sso({ email })`.
  A password sign-in on an enforced domain returns `SSO_REQUIRED` and the form
  switches to SSO mode. `?error=` from IdP callbacks is shown.

## Data / wiring
- `sso_provider` rows written by `src/app/actions/security.ts` directly
  (providerId `sso-<workspaceId>`; runtime OIDC discovery fills endpoints);
  `workspace_sso` holds `ssoProviderId`, `scimProviderId`, `enforced`.
- `src/lib/auth.ts` options: `disabledPaths` for the plugins' self-service
  provider CRUD (any signed-in user could otherwise register an IdP for any
  domain), `scim({ storeSCIMToken: 'hashed', canGenerateToken, linkExistingUsers })`,
  `hooks.before` (SSO enforcement on `/sign-in/email` + `/sign-up/email`, SCIM
  `active` toggles), `databaseHooks` (domain check on SSO/SCIM accounts,
  membership on account create, removal on account delete, SCIM user delete
  → deprovision instead of deleting the user, enforcement backstop on GitHub
  session creation). Logic lives in `src/lib/sso.ts`.
- Deprovision = remove from workspace + its projects (owners kept), sessions
  revoked; `active:false` PATCH/PUT handled by our hook (no admin plugin).

## Edge cases / security
- IdP asserting an email outside the domain → rejected (prevents takeover of
  other users via a rogue IdP). Domain unique across workspaces; free-mail
  domains refused.
- SCIM linking an existing user only if already a workspace member or on the
  verified SSO domain; SCIM-created users must be on the SSO domain when set.
- Workspace owner is never removed by SCIM.
- Audit events: `security.sso_*`, `security.scim_*`.
