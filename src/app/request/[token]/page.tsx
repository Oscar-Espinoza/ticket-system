// Public intake form (B11). No auth, outside /dashboard. The token is the only
// credential; the page reveals nothing but the project name, and an unknown or
// rotated token gets the same neutral message as a disabled form (never a 404
// that would confirm which tokens exist).

import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { signFormStamp } from '@/lib/integrations/intake';
import { IntakeForm } from '@/components/integrations/intake-form';

export const metadata: Metadata = {
  title: 'Submit a request',
  robots: { index: false, follow: false },
};

export default async function RequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [project] =
    token && token.length <= 64
      ? await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.intakeToken, token))
          .limit(1)
      : [];

  return (
    <main className="flex min-h-screen justify-center bg-background px-4 py-12 sm:py-20">
      <div className="w-full max-w-xl">
        {project ? (
          <>
            <p className="text-sm text-muted-foreground">{project.name}</p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">Submit a request</h1>
            <p className="mt-2 mb-8 text-sm text-muted-foreground">
              Report a bug or ask for something new. The team gets it as an issue to review.
            </p>
            <IntakeForm token={token} stamp={signFormStamp()} />
          </>
        ) : (
          <div className="py-16 text-center">
            <h1 className="text-xl font-medium">This form isn&rsquo;t available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The link may have changed or the form was turned off. Ask the team for a new link.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
