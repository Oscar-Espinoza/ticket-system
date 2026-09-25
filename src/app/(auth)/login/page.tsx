// Login page — server component wrapper (RESEARCH Pattern 7).
//
// If a session already exists, bounce the user to ?redirect= (or /dashboard) so
// signed-in users never see the auth pages. Otherwise render the client form.

import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { safeRedirect } from '../safe-redirect';
import { Wordmark } from '@/components/wordmark';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, query] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    searchParams,
  ]);
  // Invite links send people here with ?redirect=/invite/<token>.
  const redirectTo = safeRedirect(query.redirect);
  if (session) redirect(redirectTo);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
      <Wordmark />
      <LoginForm redirectTo={redirectTo} />
    </div>
  );
}
