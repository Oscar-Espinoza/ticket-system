// Better Auth browser client — used by client components (login/signup forms,
// logout button) to call signUp.email / signIn.email / signOut.
//
// baseURL comes from NEXT_PUBLIC_APP_URL (public env var, available in the
// browser bundle), falling back to localhost for local dev.

import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { scimClient } from '@better-auth/scim/client';
import { ssoClient } from '@better-auth/sso/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
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
