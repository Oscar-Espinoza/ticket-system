// Workspace invitation landing page. PUBLIC route. The token names a pending
// workspace_invitation row (src/lib/workspace-access.ts): unknown, expired,
// revoked or used tokens all get the same generic message; a signed-in user
// with a different email sees why they can't accept. Joining is the explicit
// POST in acceptWorkspaceInvite.

import type { Metadata } from 'next';
import Link from 'next/link';

import { getSession } from '@/lib/session';
import { getPendingWorkspaceInvite } from '@/lib/workspace-access';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AcceptWorkspaceInvite } from '@/components/workspaces/accept-workspace-invite';

export const metadata: Metadata = { title: 'Join workspace' };

export default async function WorkspaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, session] = await Promise.all([params, getSession()]);
  const invite = await getPendingWorkspaceInvite(decodeURIComponent(token));

  const user = session?.user;
  const valid = invite !== null;
  const mismatch = valid && user && invite.email.toLowerCase() !== user.email.toLowerCase();
  const roleLabel = invite?.role === 'admin' ? 'an admin' : 'a member';
  const workspaceName = invite?.workspaceName;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        {!valid && (
          <CardHeader>
            <CardTitle className="text-xl font-medium">Invalid invite link</CardTitle>
            <CardDescription className="mt-2 text-sm text-muted-foreground">
              This invitation is invalid, has expired or was already used. Ask a workspace admin
              for a new one.
            </CardDescription>
          </CardHeader>
        )}

        {valid && !user && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-medium">You’ve been invited</CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                Sign in with <strong className="text-foreground">{invite!.email}</strong> to join
                the {workspaceName} workspace as {roleLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="mt-6 w-full" asChild>
                <Link href={`/login?redirect=/invite/workspace/${token}`}>Sign in to continue</Link>
              </Button>
              <p className="mt-3 text-center text-sm text-muted-foreground">
                New here?{' '}
                <Link href={`/signup?redirect=/invite/workspace/${token}`} className="underline">
                  Create an account
                </Link>
                , then open this link again.
              </p>
            </CardContent>
          </>
        )}

        {valid && user && mismatch && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-medium">Wrong account</CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                This invitation was sent to{' '}
                <strong className="text-foreground">{invite!.email}</strong>, but you’re signed in
                as <strong className="text-foreground">{user.email}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard" className="text-sm text-muted-foreground underline">
                Go to dashboard
              </Link>
            </CardContent>
          </>
        )}

        {valid && user && !mismatch && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-medium">Join {workspaceName}</CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                You’ve been invited to this workspace as {roleLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptWorkspaceInvite token={decodeURIComponent(token)} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
