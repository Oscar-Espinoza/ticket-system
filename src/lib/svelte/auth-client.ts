// Better Auth browser client — used by client components (login/signup forms,
// logout button, 2FA / SSO / OAuth consent) to call signUp.email /
// signIn.email / signOut / twoFactor.* / signIn.sso / $fetch.
//
// Uses `better-auth/svelte` instead of
// `better-auth/react`, same plugins and two-factor redirect. `useSession()`
// returns a nanostores atom here (read with `$session` or `fromStore`), but the
// app renders auth-dependent UI from the layout's `locals.user` instead.
//
// No baseURL: Better Auth then calls the page's own origin (`/api/auth`), which
// is where src/hooks.server.ts answers. It must not point at
// PUBLIC_APP_URL, which may be another origin.

import { createAuthClient } from 'better-auth/svelte';
import { goto } from '$app/navigation';
import { isSafeUrlScheme } from '@better-auth/core/utils/url';
import type { BetterFetchPlugin } from '@better-fetch/fetch';
import { twoFactorClient } from 'better-auth/client/plugins';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { scimClient } from '@better-auth/scim/client';
import { ssoClient } from '@better-auth/sso/client';

/**
 * Better Auth's default redirect plugin, except that a redirect to this app
 * (email sign-in answers `{ redirect: true, url: callbackURL }`) is a
 * client-side navigation instead of a document load, so signing in doesn't
 * reload the page (the interface language then switches in place, see
 * src/lib/svelte/locale-switch.ts). Other origins (GitHub, Google, SSO
 * providers) still get a full navigation, as before.
 */
const redirectInApp: BetterFetchPlugin = {
  id: 'redirect-in-app',
  name: 'Redirect (client-side within the app)',
  hooks: {
    onSuccess(context) {
      const data = context.data as { url?: unknown; redirect?: unknown } | null;
      if (!data?.redirect || typeof data.url !== 'string' || !isSafeUrlScheme(data.url)) return;
      const target = new URL(data.url, window.location.href);
      if (target.origin === window.location.origin) {
        // eslint-disable-next-line svelte/no-navigation-without-resolve -- same-origin path, no base path
        void goto(`${target.pathname}${target.search}${target.hash}`, { refreshAll: true });
      } else {
        window.location.href = target.href;
      }
    },
  },
};

export const authClient = createAuthClient({
  disableDefaultFetchPlugins: true,
  fetchOptions: { plugins: [redirectInApp] },
  plugins: [
    // Sends the user to /login/two-factor when sign-in needs a second factor.
    twoFactorClient({
      // Client-side, so the second step opens without loading the document again.
      onTwoFactorRedirect() {
        // Plain path, as in the .svelte files (no base path; eslint.config.mjs).
        // eslint-disable-next-line svelte/no-navigation-without-resolve
        void goto(`/login/two-factor${window.location.search}`);
      },
    }),
    ssoClient(),
    scimClient(),
    oauthProviderClient(),
  ],
});
