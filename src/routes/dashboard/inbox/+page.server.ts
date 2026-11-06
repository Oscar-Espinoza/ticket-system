import { getInbox } from '@/lib/notifications/inbox';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();

  const { notifications, issues } = await getInbox(user.id);
  return { notifications, issues };
};
