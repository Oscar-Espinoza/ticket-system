// Minimal authenticated dashboard (D-09) — the Phase 2 project-list seam.
//
// Shows: a time-of-day greeting and a GitHub-connected status badge derived
// from the account table at render time (D-05 — never from the session JWT).
// Plan 03 wired the real check.
//
// RESEARCH Pattern 5 prefers auth.api.listUserAccounts({ headers }); Open
// Question 1 flagged that its server-side signature was uncertain (A2). We use
// the resolved fallback: a direct account-table lookup via isGitHubConnected(),
// which selects only account.id (never the token), so connection status can
// never leak the GitHub access token (D-05).
//
// The project list renders via the directly-mounted <ProjectList /> below
// (CR-01: this is a page.tsx, which App Router never passes `children`).

import type { Metadata } from 'next';
import { getSession } from '@/lib/session';
import { CheckCircle, CircleOff } from 'lucide-react';
import { isGitHubConnected } from '@/lib/github-token';
import { ProjectList, getProjectsForUser } from '@/components/project-list';
import { DashboardGreeting } from '@/components/dashboard-greeting';
import { LabelChip } from '@/components/ui-icons';

export const metadata: Metadata = { title: 'Projects' };

export default async function DashboardPage() {
  // Layout already guarded this route; session is guaranteed non-null here, but
  // we re-read it for the user's email/name (server-side, no client exposure).
  const session = await getSession();
  const user = session?.user;

  // D-05: connection status is derived from the account table at render time,
  // never from the session. isGitHubConnected selects only account.id — the
  // token never reaches this page.
  // Warms the cached project query in parallel so <ProjectList> doesn't wait
  // behind the GitHub check.
  const [githubConnected] = user
    ? await Promise.all([isGitHubConnected(user.id), getProjectsForUser(user.id)])
    : [false];

  return (
    <>
      <DashboardGreeting name={user?.name} />

      <div className="mt-4">
        {githubConnected ? (
          <LabelChip color="primary" dot={false}>
            <CheckCircle className="size-3 text-primary" />
            GitHub connected
          </LabelChip>
        ) : (
          <LabelChip dot={false}>
            <CircleOff className="size-3" />
            GitHub not connected
          </LabelChip>
        )}
      </div>

      {/* IN-01: session already resolved above — pass userId so ProjectList
          doesn't resolve it a second time. */}
      <ProjectList userId={user?.id} />
    </>
  );
}
