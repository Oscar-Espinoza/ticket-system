// Better Auth browser client — used by client components (login/signup forms,
// logout button) to call signUp.email / signIn.email / signOut.
//
// baseURL comes from NEXT_PUBLIC_APP_URL (public env var, available in the
// browser bundle), falling back to localhost for local dev.

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
});
