// Members page — MEM-04, MEM-01 (owner-only invite panel)
//
// Security: requireProjectMember runs BEFORE any project-scoped DB read.
// A ProjectAccessError maps to notFound() so the page returns a 404 and does
// NOT confirm a project's existence to outsiders (enumeration-resistant, D-15,
// T-03-06). The invite panel and controls only render when membership.role === 'owner'
// — gating is ALSO enforced server-side in generateInviteLink via requireProjectOwner (D-25).
//
// Roster SELECT selects userId, name, role so Plan 04 can wire removeMember(projectId, row.userId).
//
// M2: content-only — the hand-rolled top nav (wordmark + email) moved into the
// AppShell; this page renders no <header>/<main> of its own.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projects, projectMembers, invitations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Separator } from '@/components/ui/separator';
import { InvitePanel } from '@/components/invite-panel';
import { MemberList } from '@/components/member-list';

export default async function MembersPage({
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
  // D-15, T-03-06). Re-throw anything else — never swallow unexpected errors.
  let membership: Awaited<ReturnType<typeof requireProjectMember>>;
  try {
    membership = await requireProjectMember(id, session.user.id);
  } catch (err) {
    if (err instanceof ProjectAccessError) notFound();
    throw err; // REQUIRED: re-throw non-domain errors
  }

  // Step 4: Project SELECT — only runs after membership is confirmed.
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) notFound();

  // Step 5: Roster SELECT — all three columns required:
  //   userId: needed for Plan 04 removeMember(projectId, row.userId)
  //   name:   displayed in the roster
  //   role:   used for role badge (owner/member)
  const roster = await db
    .select({
      id: projectMembers.id,      // needed by MemberList → removeMember FormData (memberId)
      userId: projectMembers.userId,
      name: users.name,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, id));

  // Step 6: Load current invitation row (if any) for the invite panel.
  const [invitation] = await db
    .select({ token: invitations.token })
    .from(invitations)
    .where(eq(invitations.projectId, id))
    .limit(1);

  // Compute the absolute invite URL from the stored token (D-25).
  // The URL is derived server-side and passed to InvitePanel as a prop
  // so the client component never reads NEXT_PUBLIC_APP_URL itself.
  const existingUrl = invitation
    ? `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`
    : null;

  // M2 content-only fragment — the AppShell owns the header and content area.
  return (
    <>
      {/* Back link to project */}
      <Link
        href={`/dashboard/projects/${id}`}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to project
      </Link>

      <h1 className="text-xl font-semibold mb-8">Members</h1>

      {/* Invite panel — owner-only (D-25, D-32) */}
      {membership.role === 'owner' && (
        <>
          <InvitePanel projectId={id} inviteUrl={existingUrl} />
          <Separator className="my-6" />
        </>
      )}

      {/* Roster section — visible to all members (MEM-04) */}
      {/* Remove controls only rendered for owner; server guards all removeMember calls */}
      <section>
        <h2 className="text-base font-semibold mb-4">Team members</h2>
        <MemberList
          members={roster}
          isOwner={membership.role === 'owner'}
          currentUserId={session.user.id}
          projectId={id}
        />
      </section>
    </>
  );
}
