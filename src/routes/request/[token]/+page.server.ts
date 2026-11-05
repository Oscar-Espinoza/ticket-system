// Public intake form (B11; port of src/app/request/[token]/page.tsx). No auth,
// outside /dashboard. The token is the only credential; the page reveals
// nothing but the project name, and an unknown or rotated token gets the same
// neutral message as a disabled form (never a 404 that would confirm which
// tokens exist).

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { signFormStamp } from '@/lib/integrations/intake';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { token } = params;
  const [project] =
    token && token.length <= 64
      ? await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.intakeToken, token))
          .limit(1)
      : [];

  return {
    token,
    projectName: project?.name ?? null,
    // Signed per render, as the Next server component did.
    stamp: project ? signFormStamp() : null,
  };
};
