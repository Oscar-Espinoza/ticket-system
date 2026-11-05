// Better Auth browser client — used by client components (login/signup forms,
// logout button, 2FA / SSO / OAuth consent) to call signUp.email /
// signIn.email / signOut / twoFactor.* / signIn.sso / $fetch.
//
// Svelte port of src/lib/auth-client.ts: `better-auth/svelte` instead of
// `better-auth/react`, same plugins and two-factor redirect. `useSession()`
// returns a nanostores atom here (read with `$session` or `fromStore`), but the
// app renders auth-dependent UI from the layout's `locals.user` instead.
//
// No baseURL: Better Auth then calls the page's own origin (`/api/auth`), which
// is where src/hooks.server.ts answers. The React client pointed at
// PUBLIC_APP_URL, which during the migration is the Next app's origin.

import { createAuthClient } from 'better-auth/svelte';
import { twoFactorClient } from 'better-auth/client/plugins';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { scimClient } from '@better-auth/scim/client';
import { ssoClient } from '@better-auth/sso/client';

export const authClient = createAuthClient({
  plugins: [
    // Sends the user to /login/two-factor when sign-in needs a second factor.
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = `/login/two-factor${window.location.search}`;
      },
    }),
    ssoClient(),
    scimClient(),
    oauthProviderClient(),
  ],
});
