// Saved views across every project the viewer belongs to: their own, then
// views other members shared.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layers } from 'lucide-react';

import { getProjectsForUser } from '@/components/project-list';
import { ViewList, type ViewListItem } from '@/components/navigation/view-list';
import { EmptyState } from '@/components/ui-icons';
import { getFavoritedIds } from '@/lib/favorites';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';
import { getVisibleViews } from '@/lib/views';

export const metadata: Metadata = { title: 'Views' };

export default async function ViewsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const [views, favorited, projects] = await Promise.all([
    getVisibleViews(userId),
    getFavoritedIds(userId, 'view'),
    getProjectsForUser(userId),
  ]);
  const roles = new Map(projects.map((p) => [p.id, p.role]));
  const items: ViewListItem[] = views.map((view) => {
    const role = view.projectId ? roles.get(view.projectId) : undefined;
    return {
      ...view,
      favorited: favorited.has(view.id),
      canShare: role ? roleAllows(role, 'write') : false,
    };
  });
  const mine = items.filter((v) => v.isOwner);
  const shared = items.filter((v) => !v.isOwner);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-medium">Views</h1>
      {items.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="No saved views yet"
          description="Filter and arrange a project's issues, then choose “Save view” in the toolbar. Views shared by teammates show up here too."
        />
      ) : (
        <>
          {mine.length > 0 && (
            <section aria-labelledby="views-mine" className="flex flex-col gap-1">
              <h2 id="views-mine" className="px-2 text-xs font-medium text-muted-foreground">
                Your views
              </h2>
              <ViewList views={mine} />
            </section>
          )}
          {shared.length > 0 && (
            <section aria-labelledby="views-shared" className="flex flex-col gap-1">
              <h2 id="views-shared" className="px-2 text-xs font-medium text-muted-foreground">
                Shared with you
              </h2>
              <ViewList views={shared} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
