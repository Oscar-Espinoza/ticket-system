// A project's saved views (the viewer's own + ones shared with the project).
// The project layout already verified membership.

import { redirect } from 'next/navigation';
import { Layers } from 'lucide-react';

import { ViewList, type ViewListItem } from '@/components/navigation/view-list';
import { EmptyState } from '@/components/ui-icons';
import { getFavoritedIds } from '@/lib/favorites';
import { getProjectData } from '@/lib/project-data';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';
import { getVisibleViews } from '@/lib/views';

export const metadata = { title: 'Views' };

export default async function ProjectViewsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const [data, views, favorited] = await Promise.all([
    getProjectData(id, userId),
    getVisibleViews(userId, id),
    getFavoritedIds(userId, 'view'),
  ]);
  const canShare = data ? roleAllows(data.project.role, 'write') : false;
  const items: ViewListItem[] = views.map((view) => ({
    ...view,
    favorited: favorited.has(view.id),
    canShare,
  }));

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Layers />}
        title="No views in this project"
        description="Filter and arrange the issue list, then choose “Save view” in the toolbar. Shared views appear here for everyone in the project."
      />
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <ViewList views={items} showProject={false} />
    </div>
  );
}
