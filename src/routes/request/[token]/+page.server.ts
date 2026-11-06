// Public intake form. No auth,
// outside /dashboard. The token is the only credential; the page reveals
// nothing but the project name, and an unknown or rotated token gets the same
// neutral message as a disabled form (never a 404 that would confirm which
// tokens exist).

import { signFormStamp } from '@/lib/integrations/intake';
import { getIntakeProjectName } from '@/lib/public-links-read';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { token } = params;
  const project = token && token.length <= 64 ? await getIntakeProjectName(token) : undefined;

  return {
    token,
    projectName: project?.name ?? null,
    // Signed per render.
    stamp: project ? signFormStamp() : null,
  };
};
