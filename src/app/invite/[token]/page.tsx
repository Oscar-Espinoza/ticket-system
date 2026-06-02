// Invite landing page — MEM-02, D-26, D-27, D-28.
//
// PUBLIC route (outside /dashboard). No DashboardLayout guard.
// The page handles auth state internally — three render states:
//
//   State A — valid token + logged-in user → "Join {projectName}" with JoinProjectButton
//   State B — valid token + logged-out visitor → sign-in CTA returning to this invite link
//   State C — invalid/expired/unknown token → clean error page (never Next's not-found, D-28)
//
// D-26: logged-out visitor redirects to /login?redirect=/invite/[token] after auth.
// D-27: joining is an explicit POST from JoinProjectButton — visiting this page is read-only.
// D-28: invalid/expired token returns 200 with a generic message — next/navigation not-found
//       is intentionally avoided (it would confirm token existence, leaking info).

import Link from 'next/link';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invitations, projects } from '@/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JoinProjectButton } from '@/components/join-project-button';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Step 1: Resolve async params (Next.js 15 — params is a Promise).
  const { token } = await params;

  // Step 2: Resolve the invitation: token match AND expiresAt > now (D-24/D-28).
  // Return 200 with the error state for invalid tokens — do not use Next's 404 helper
  // to avoid confirming whether a token exists (D-28).
  const [invitation] = await db
    .select({
      projectId: invitations.projectId,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.token, token),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  // Step 3: Look up the project name (only if the token is valid).
  let projectName: string | undefined;
  if (invitation) {
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, invitation.projectId))
      .limit(1);
    projectName = project?.name;
  }

  const isValid = !!invitation && !!projectName;

  // Step 4: Resolve session — may be null; do NOT redirect unconditionally (D-26).
  // The page renders different states based on auth status, not just redirecting.
  const session = await auth.api.getSession({ headers: await headers() });

  // Step 5: Centered card layout (UI-SPEC, 03-PATTERNS.md).
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        {/* State C — Invalid / expired / unknown token (D-28) */}
        {!isValid && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Invalid invite link
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-2">
                This invite link is invalid or has expired. Ask the project
                owner for a new link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {session?.user && (
                <Link
                  href="/dashboard"
                  className="text-sm text-muted-foreground underline"
                >
                  Go to dashboard
                </Link>
              )}
            </CardContent>
          </>
        )}

        {/* State B — Valid token, logged-out visitor */}
        {isValid && !session?.user && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                You&apos;ve been invited
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-2">
                Sign in to join {projectName}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* CTA: sign in and return to the invite link after auth (D-26) */}
              <Button className="w-full mt-6" asChild>
                <Link href={`/login?redirect=/invite/${token}`}>
                  Sign in to continue
                </Link>
              </Button>
            </CardContent>
          </>
        )}

        {/* State A — Valid token, logged-in user */}
        {isValid && session?.user && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Join {projectName}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-2">
                You&apos;ve been invited to join this project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* JoinProjectButton handles the POST — the Server Action redirects on success (D-27) */}
              <JoinProjectButton token={token} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
