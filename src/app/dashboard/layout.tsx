// Dashboard auth guard — THE security boundary for protected routes (D-10).
//
// This is a SERVER-SIDE check, deliberately NOT middleware: CVE-2025-29927 lets
// an attacker bypass Next.js middleware via a spoofed `x-middleware-subrequest`
// header. A server component session check cannot be bypassed that way.
//
// `auth.api.getSession` reads the session cookie from the incoming request
// headers. If there is no valid session we redirect to /login; otherwise we
// render the protected children. No cookie cache is enabled (auth.ts), so a
// signed-in refresh resolves a real session and never bounces to /login.

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  return <>{children}</>;
}
