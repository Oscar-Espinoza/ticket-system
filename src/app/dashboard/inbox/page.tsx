import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { InboxView } from '@/components/inbox/inbox-view';
import { getInbox } from '@/lib/notifications/inbox';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const { notifications, issues } = await getInbox(session.user.id);
  return <InboxView notifications={notifications} issues={issues} />;
}
