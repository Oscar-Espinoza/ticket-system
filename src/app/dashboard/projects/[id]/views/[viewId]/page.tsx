// One saved view: the project's issues through the view's filters and display
// options. Visibility (owner, or shared + member) is checked in SQL.

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Users } from 'lucide-react';

import { FavoriteButton } from '@/components/navigation/favorite-button';
import { SavedViewIssues } from '@/components/navigation/saved-view-issues';
import { getFavoritedIds } from '@/lib/favorites';
import { VIEW_COOKIE } from '@/lib/issue-model';
import { getSession } from '@/lib/session';
import { getProjectIssues } from '@/lib/tickets';
import { getViewForUser } from '@/lib/views';

type Params = Promise<{ id: string; viewId: string }>;

async function loadView(id: string, viewId: string) {
  const session = await getSession();
  if (!session?.user) return null;
  const view = await getViewForUser(viewId, session.user.id);
  return view && view.projectId === id ? { view, userId: session.user.id } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, viewId } = await params;
  const found = await loadView(id, viewId);
  return { title: found ? found.view.name : 'View not found' };
}

export default async function SavedViewPage({ params }: { params: Params }) {
  const { id, viewId } = await params;
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const found = await loadView(id, viewId);
  if (!found) notFound();
  const { view, userId } = found;

  const [issues, favorited, cookieStore] = await Promise.all([
    getProjectIssues(id, userId),
    getFavoritedIds(userId, 'view'),
    cookies(),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-start gap-2">
        <Link
          href={`/dashboard/projects/${id}/views`}
          aria-label="All views"
          className="mt-0.5 rounded-md p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 truncate text-base font-medium">
            {view.name}
            {view.shared && (
              <span
                className="flex items-center gap-1 text-xs font-normal text-muted-foreground"
                title="Shared with project members"
              >
                <Users className="size-3.5" />
                Shared
              </span>
            )}
          </h2>
          {view.description && (
            <p className="truncate text-sm text-muted-foreground">{view.description}</p>
          )}
          {!view.isOwner && view.ownerName && (
            <p className="text-xs text-muted-foreground">Created by {view.ownerName}</p>
          )}
        </div>
        <FavoriteButton targetType="view" targetId={view.id} initial={favorited.has(view.id)} />
      </div>

      <SavedViewIssues
        view={{
          id: view.id,
          name: view.name,
          isOwner: view.isOwner,
          shared: view.shared,
          filters: view.filters,
          display: view.display,
        }}
        issues={issues}
        defaultView={cookieStore.get(VIEW_COOKIE)?.value}
      />
    </div>
  );
}
