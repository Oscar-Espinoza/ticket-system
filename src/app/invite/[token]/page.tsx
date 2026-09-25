// Invite landing page. PUBLIC route (outside /dashboard); it resolves the
// session itself and renders one of four states:
//
//   invalid   — unknown / expired / already-used token: a generic message
//               (never notFound(), which would confirm whether a token exists)
//   signed out — sign-in CTA returning here (/login?redirect=/invite/[token])
//   mismatch  — email invitation for a different address than the session's
//   ready     — "Join {project}" with the role; JoinProjectButton POSTs
//
// Visiting is read-only: joining is the explicit POST in joinProject.

import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { invitations, projects, users } from '@/db/schema';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JoinProjectButton } from '@/components/join-project-button';
import { PROJECT_ROLE_LABEL } from '@/components/workspaces/role-rules';

export const metadata: Metadata = { title: 'Join project' };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, session] = await Promise.all([params, getSession()]);

  const [invitation] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      projectName: projects.name,
      inviterName: users.name,
    })
    .from(invitations)
    .innerJoin(projects, eq(invitations.projectId, projects.id))
    .leftJoin(users, eq(invitations.invitedById, users.id))
    .where(
      and(
        eq(invitations.token, token),
        gt(invitations.expiresAt, new Date()),
        isNull(invitations.acceptedAt),
      ),
    )
    .limit(1);

  const user = session?.user;
  const isEmailInvite = Boolean(invitation?.email);
  const mismatch =
    invitation && user && isEmailInvite && invitation.email!.toLowerCase() !== user.email.toLowerCase();
  const roleLabel = invitation ? PROJECT_ROLE_LABEL[isEmailInvite ? invitation.role : 'member'] : '';
  const invitedBy = invitation?.inviterName ? `${invitation.inviterName} invited you` : 'You’ve been invited';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        {!invitation && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-medium">Invalid invite link</CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                This invitation is invalid, has expired or has already been used. Ask a
                project admin for a new one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user && (
                <Link href="/dashboard" className="text-sm text-muted-foreground underline">
                  Go to dashboard
                </Link>
              )}
            </CardContent>
          </>
        )}

        {invitation && !user && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-medium">{invitedBy}</CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                Sign in to join {invitation.projectName} as {roleLabel.toLowerCase()}.
                {isEmailInvite && (
                  <>
                    {' '}
                    Use <strong className="text-foreground">{invitation.email}</strong>.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="mt-6 w-full" asChild>
                <Link href={`/login?redirect=/invite/${token}`}>Sign in to continue</Link>
              </Button>
              <p className="mt-3 text-center text-sm text-muted-foreground">
                New here?{' '}
                <Link href={`/signup?redirect=/invite/${token}`} className="underline">
                  Create an account
                </Link>
                , then open this link again.
              </p>
            </CardContent>
          </>
        )}

        {invitation && user && mismatch && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-medium">Wrong account</CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                This invitation to {invitation.projectName} was sent to{' '}
                <strong className="text-foreground">{invitation.email}</strong>, but you’re
                signed in as <strong className="text-foreground">{user.email}</strong>. Sign
                in with the invited address to accept it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard" className="text-sm text-muted-foreground underline">
                Go to dashboard
              </Link>
            </CardContent>
          </>
        )}

        {invitation && user && !mismatch && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-medium">Join {invitation.projectName}</CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                {invitedBy} to join this project as {roleLabel.toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JoinProjectButton token={token} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
