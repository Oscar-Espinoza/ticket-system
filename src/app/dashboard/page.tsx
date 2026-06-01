// Minimal authenticated dashboard (D-09) — the Phase 2 project-list seam.
//
// Shows: top nav (app name + user email + logout), a time-of-day greeting, and
// a GitHub-connected status badge. In Plan 02 the badge is a PLACEHOLDER that
// always renders "GitHub not connected" (outline variant). Plan 03 swaps in the
// real check (auth.api.listUserAccounts / accounts query, RESEARCH Pattern 5).
//
// No project-list UI is built here — `{children}` renders below the greeting so
// Phase 2 drops the list in without touching this shell.

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { CircleOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LogoutButton } from '@/components/logout-button';

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
          {/* ── Plan 03 extension point ────────────────────────────────────
              Placeholder GitHub status badge. Plan 03 replaces this with the
              real connected/not-connected check (listUserAccounts / accounts
              query). Until then it always shows "GitHub not connected". */}
          <Badge variant="outline">
            <CircleOff />
            GitHub not connected
          </Badge>
        </div>

        {/* Phase 2 seam: the project list renders here without touching the shell. */}
        {children}
      </main>
    </div>
  );
}
