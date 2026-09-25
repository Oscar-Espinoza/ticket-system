// Second sign-in step for accounts with two-factor authentication. The
// twoFactorClient plugin sends the browser here (keeping ?redirect=) after a
// correct password; the pending sign-in lives in a short-lived signed cookie.

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { Wordmark } from '@/components/wordmark';
import { safeRedirect } from '../../safe-redirect';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Two-factor authentication' };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, query] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    searchParams,
  ]);
  const redirectTo = safeRedirect(query.redirect);
  if (session) redirect(redirectTo);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
      <Wordmark />
      <TwoFactorForm redirectTo={redirectTo} />
    </div>
  );
}
