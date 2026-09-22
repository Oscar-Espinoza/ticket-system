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
import { getProjectsForUser } from '@/components/project-list';
import { TopbarChrome } from '@/components/topbar-chrome';
import { UserMenu } from '@/components/user-menu';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';

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

  // M2: the guard above is UNTOUCHED (D-10 security boundary) — the app shell
  // renders only below it, so every shell page is behind the same check.
  //
  // M3: C2 slot content only (allowed by M2/M3 contracts — never edit
  // AppShell internals or the guard). The palette needs the project list on
  // the client; AppShell resolves its own copy internally (C2-frozen), so the
  // layout resolves it here for its slot nodes with the SAME query function —
  // sidebar, breadcrumb and palette can never disagree.
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
