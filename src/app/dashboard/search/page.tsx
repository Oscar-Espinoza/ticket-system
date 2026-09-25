// Issue search across the viewer's projects (Postgres full-text; see lib/search).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Search, SearchX } from 'lucide-react';

import { getProjectsForUser } from '@/components/project-list';
import { Highlight } from '@/components/navigation/highlight';
import { NavList } from '@/components/navigation/list-navigation';
import { NavIssueRow } from '@/components/navigation/nav-issue-row';
import { SearchControls } from '@/components/navigation/search-controls';
import { EmptyState } from '@/components/ui-icons';
import { searchIssues } from '@/lib/search';
import { getSession } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const q = first((await searchParams).q).trim();
  return { title: q ? `Search: ${q.slice(0, 60)}` : 'Search' };
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const q = first(params.q).trim();
  const includeArchived = first(params.archived) === '1';
  const projects = await getProjectsForUser(userId);
  // Ignore a project filter the viewer can't see (the query is membership-scoped anyway).
  const requested = first(params.project);
  const projectId = projects.some((p) => p.id === requested) ? requested : null;

  const results = q ? await searchIssues(userId, q, { projectId, includeArchived }) : [];
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <h1 className="text-xl font-medium">Search</h1>
      <SearchControls
        query={q}
        projectId={projectId}
        includeArchived={includeArchived}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />

      {!q ? (
        <EmptyState
          icon={<Search />}
          title="Search your issues"
          description="Matches titles, descriptions and comments in every project you belong to. Try phrases in quotes, or -word to exclude."
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="No results"
          description={
            includeArchived
              ? `Nothing matches “${q}”.`
              : `Nothing matches “${q}”. Archived issues are excluded — turn on “Include archived” to search them too.`
          }
        />
      ) : (
        <section aria-label="Results" className="flex flex-col gap-2">
          <p className="px-2 text-xs text-muted-foreground">
            {results.length === 1 ? '1 result' : `${results.length} results`}
            {results.length >= 50 && ' (showing the best 50)'}
          </p>
          <NavList className="flex flex-col gap-px">
            {results.map(({ issue, title, snippet }) => (
              <NavIssueRow
                key={issue.id}
                issue={issue}
                title={<Highlight text={title} />}
                project={projectNames.get(issue.projectId)}
                below={
                  snippet ? (
                    <>
                      {snippet.source === 'comment' && (
                        <span className="font-medium">Comment: </span>
                      )}
                      <Highlight text={snippet.text} />
                    </>
                  ) : issue.archivedAt ? (
                    'Archived'
                  ) : undefined
                }
              />
            ))}
          </NavList>
        </section>
      )}
    </div>
  );
}
