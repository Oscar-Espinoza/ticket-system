// Project detail page (PROJ-03, MEM-06, D-15, D-21).
//
// Authorization is the FIRST operation — requireProjectMember runs before any
// project-scoped DB read. A ProjectAccessError maps to notFound() so the page
// returns a 404 and does NOT confirm a project's existence to outsiders
// (enumeration-resistant, D-15). Unexpected errors are re-thrown so they
// surface correctly instead of being swallowed by the catch block.
//
// The page renders a header (project name + ticket-key badge) and an empty
// ticket-list placeholder. No New-ticket button is rendered (D-21 — deferred
// to Phase 5; ship no non-functional controls).
//
// M2: content-only — the hand-rolled top nav (wordmark, Members link, email)
// moved into the AppShell; the Members link now lives in the content area next
// to the back-link (a MOVE, not a redesign — visual redesign is M4's job).
//
// Security note: this check lives in the Server Component, not middleware.
// CVE-2025-29927 lets an attacker spoof the x-middleware-subrequest header to
// bypass middleware checks — server-side session + DAL authorization cannot be
// bypassed that way (D-10, D-13).

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { LabelChip } from '@/components/ui-icons';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Step 1: Resolve async params (Next.js 15 — params is a Promise).
  const { id } = await params;

  // Step 2: Resolve session — redirect unauthenticated users to /login.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login');
  }

  // Step 3: Authorization FIRST — requireProjectMember runs BEFORE any project
  // SELECT. On ProjectAccessError map to notFound() (404, enumeration-resistant,
  // D-15). Re-throw anything else so unexpected errors are not silently swallowed
  // (T-02-11 threat mitigation — the re-throw is REQUIRED).
  try {
    await requireProjectMember(id, session.user.id);
  } catch (err) {
    if (err instanceof ProjectAccessError) notFound();
    throw err; // REQUIRED: re-throw non-domain errors
  }

  // Step 4: Project SELECT — only runs after membership is confirmed (the
  // 403-before-DB guarantee, MEM-06, success criterion #4).
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      ticketKey: projects.ticketKey,
    })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) notFound();

  // Step 5: Render — header + empty ticket-list placeholder.
  // No New-ticket button or CTA (D-21 — deferred to Phase 5).
  // M2: content-only fragment — chrome (wordmark, email) lives in the AppShell;
  // no page-level <header>/<main> remains.
  return (
    <>
      {/* Navigation row — back-link (left) + Members link (right, moved here
          verbatim from the deleted top nav) */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to projects
        </Link>
        <Link
          href={`/dashboard/projects/${id}/members`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Members
        </Link>
      </div>

      {/* Project header — name (h1, 20px/600) + ticket-key chip (font-mono, C4 LabelChip) */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <LabelChip dot={false} className="font-mono">
          {project.ticketKey}
        </LabelChip>
      </div>

      {/* Empty ticket-list placeholder — no New-ticket button (D-21) */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <h2 className="text-base font-semibold">No tickets yet</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Tickets will appear here once you create them.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
