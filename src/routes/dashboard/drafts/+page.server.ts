// Drafts — the viewer's unfinished new issues across projects.

import { getDrafts } from '@/lib/account-settings-read';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();
  return { drafts: await getDrafts(user.id) };
};
