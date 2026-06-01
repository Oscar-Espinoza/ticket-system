// Minimal authenticated dashboard (D-09) — the Phase 2 project-list seam.
//
// Shows: top nav (app name + user email + logout), a time-of-day greeting, and
// a GitHub-connected status badge derived from the account table at render time
// (D-05 — never from the session JWT). Plan 03 wired the real check.
//
// RESEARCH Pattern 5 prefers auth.api.listUserAccounts({ headers }); Open
// Question 1 flagged that its server-side signature was uncertain (A2). We use
// the resolved fallback: a direct account-table lookup via isGitHubConnected(),
// which selects only account.id (never the token), so connection status can
// never leak the GitHub access token (D-05).
//
// No project-list UI is built here — `{children}` renders below the greeting so
// Phase 2 drops the list in without touching this shell.

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { CheckCircle, CircleOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LogoutButton } from '@/components/logout-button';
import { isGitHubConnected } from '@/lib/github-token';

function greetingFor(name: string | null | undefined): string {
  if (!name) return 'Welcome back';
  const firstName = name.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `Good ${timeOfDay}, ${firstName}`;
}

export default async function DashboardPage({
  children,
}: {
  children?: React.ReactNode;
}) {
  // Layout already guarded this route; session is guaranteed non-null here, but
  // we re-read it for the user's email/name (server-side, no client exposure).
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  // D-05: connection status is derived from the account table at render time,
  // never from the session. isGitHubConnected selects only account.id — the
  // token never reaches this page.
  const githubConnected = user ? await isGitHubConnected(user.id) : false;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <span className="text-sm font-semibold">Ticket System</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-6 py-8">
        <h2 className="text-xl font-semibold">{greetingFor(user?.name)}</h2>

        <div className="mt-4">
          {/* Real GitHub-connected badge (UI-SPEC). Connected -> secondary +
              CheckCircle; not connected -> outline + CircleOff. */}
          {githubConnected ? (
            <Badge variant="secondary">
              <CheckCircle />
              GitHub connected
            </Badge>
          ) : (
            <Badge variant="outline">
              <CircleOff />
              GitHub not connected
            </Badge>
          )}
        </div>

        {/* Phase 2 seam: the project list renders here without touching the shell. */}
        {children}
      </main>
    </div>
  );
}
