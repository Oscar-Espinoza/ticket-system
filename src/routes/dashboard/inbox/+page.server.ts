import { redirect } from '@sveltejs/kit';

import { getInbox } from '@/lib/notifications/inbox';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');

  const { notifications, issues } = await getInbox(session.user.id);
  return { notifications, issues };
};
