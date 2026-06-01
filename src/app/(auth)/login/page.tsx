// Login page — server component wrapper (RESEARCH Pattern 7).
//
// If a session already exists, bounce the user to /dashboard so signed-in users
// never see the auth pages. Otherwise render the client form.

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/dashboard');

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <LoginForm />
    </div>
  );
}
