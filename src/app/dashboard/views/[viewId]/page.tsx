// Short link for a saved view → its project page (views live in a project).

import { notFound, redirect } from 'next/navigation';

import { getSession } from '@/lib/session';
import { getViewForUser } from '@/lib/views';

export default async function ViewRedirect({ params }: { params: Promise<{ viewId: string }> }) {
  const [{ viewId }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const view = await getViewForUser(viewId, session.user.id);
  if (!view) notFound();
  // Project-less views have no page of their own yet; list them with the rest.
  redirect(view.projectId ? `/dashboard/projects/${view.projectId}/views/${view.id}` : '/dashboard/views');
}
