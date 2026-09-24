// Signup page — server component wrapper (RESEARCH Pattern 7).
//
// Already-authenticated users are redirected to /dashboard; otherwise the
// client signup form renders.

import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignupForm } from './signup-form';
import { Wordmark } from '@/components/wordmark';

export const metadata: Metadata = { title: 'Sign up' };

export default async function SignupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/dashboard');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
      <Wordmark />
      <SignupForm />
    </div>
  );
}
