// Project settings › Members — MEM-04, MEM-01 (owner-only invite panel)
//
// Security: getMemberProject (membership inner join) runs before any other
// project-scoped read; non-members get notFound() so outsiders can't probe
// project ids (D-15, T-03-06). The invite panel only renders for owners, and
// generateInviteLink re-checks ownership server-side (D-25).

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projectMembers, invitations, users } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { Separator } from '@/components/ui/separator';
import { InvitePanel } from '@/components/invite-panel';
import { MemberList } from '@/components/member-list';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const project = session?.user ? await getMemberProject(id, session.user.id) : null;
  return { title: project ? `Members · ${project.name}` : 'Project not found' };
}

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) {
    redirect('/login');
  }

  const project = await getMemberProject(id, session.user.id);
  if (!project) notFound();
  const isOwner = project.role === 'owner';

  const [roster, invitation] = await Promise.all([
    db
      .select({
        id: projectMembers.id, // MemberList → removeMember FormData (memberId)
        userId: projectMembers.userId,
        name: users.name,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, id)),
    // Only owners see the invite panel.
    isOwner
      ? db
          .select({ token: invitations.token })
          .from(invitations)
          // Shareable link only; email invitations (email set) are per-person.
          .where(and(eq(invitations.projectId, id), isNull(invitations.email)))
          .limit(1)
          .then(([row]) => row ?? null)
      : null,
  ]);

  // Compute the absolute invite URL from the stored token (D-25).
  // The URL is derived server-side and passed to InvitePanel as a prop
  // so the client component never reads NEXT_PUBLIC_APP_URL itself.
  const existingUrl = invitation
    ? `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`
    : null;

  return (
    <>
      <h1 className="text-xl font-medium">Members</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        People who can see and work on this project.
      </p>

      {/* Invite panel — owner-only (D-25, D-32) */}
      {isOwner && (
        <>
          <InvitePanel projectId={id} inviteUrl={existingUrl} />
          <Separator className="my-6" />
        </>
      )}

      {/* Roster section — visible to all members (MEM-04) */}
      {/* Remove controls only rendered for owner; server guards all removeMember calls */}
      <section>
        <h2 className="text-base font-medium mb-4">Team members</h2>
        <MemberList
          members={roster.map((member) => ({
            ...member,
            // MemberList (B9 extends it for admin/guest) only knows owner vs member.
            role: member.role === 'owner' ? ('owner' as const) : ('member' as const),
          }))}
          isOwner={isOwner}
          currentUserId={session.user.id}
          projectId={id}
        />
      </section>
    </>
  );
}
