// Dashboard auth guard — THE security boundary for protected routes (D-10).
//
// This is a SERVER-SIDE check, deliberately NOT middleware: CVE-2025-29927 lets
// an attacker bypass Next.js middleware via a spoofed `x-middleware-subrequest`
// header. A server component session check cannot be bypassed that way.
//
// `auth.api.getSession` reads the session cookie from the incoming request
// headers. If there is no valid session we redirect to /login; otherwise we
// render the protected children. The session cookie cache (auth.ts) falls back
// to the DB when stale, so a signed-in refresh never bounces to /login.

import { getSession } from '@/lib/session';
import { getProjectsForUser } from '@/components/project-list';
import { TopbarChrome } from '@/components/topbar-chrome';
import { UserMenu } from '@/components/user-menu';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  // Memoized per request (React cache) — AppShell and ProjectList reuse it.
  const projects = await getProjectsForUser(session.user.id);

  return (
    <AppShell
      user={session.user}
      topbarRight={
        <TopbarChrome projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      }
      sidebarFooter={<UserMenu user={session.user} />}
    >
      {children}
    </AppShell>
  );
}
