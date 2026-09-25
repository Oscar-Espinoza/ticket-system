// Issue search across the viewer's projects (Postgres full-text + filter
// syntax such as `label:bug is:open`; see lib/search).

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
import { searchDocuments } from '@/lib/documents';
import { documentPath } from '@/components/documents/document-model';
import { DocumentIcon } from '@/components/documents/document-icon';
import Link from 'next/link';
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

  // Docs match free text only: drop filter terms like `label:bug` first.
  const docText = q
    .replace(/(^|\s)-?[a-z]+:("[^"]*"|\S+)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const [results, allDocs] = await Promise.all([
    q ? searchIssues(userId, q, { projectId, includeArchived }) : Promise.resolve([]),
    docText ? searchDocuments(userId, docText, 10) : Promise.resolve([]),
  ]);
  const docs = projectId ? allDocs.filter((d) => d.projectId === projectId) : allDocs;
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
          description="Matches titles, descriptions and comments in every project you belong to. Try phrases in quotes, -word to exclude, or filters like label:bug assignee:me is:open."
        />
      ) : results.length === 0 && docs.length === 0 ? (
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
        <>
          {docs.length > 0 && (
            <section aria-label="Documents" className="flex flex-col gap-2">
              <p className="px-2 text-xs text-muted-foreground">
                {docs.length === 1 ? '1 document' : `${docs.length} documents`}
              </p>
              <ul className="flex flex-col gap-px">
                {docs.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={documentPath(doc.projectId, doc.id)}
                      className="flex items-start gap-3 rounded-md px-2 py-2 text-sm outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <DocumentIcon icon={doc.icon} className="mt-0.5" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{doc.title}</span>
                        {doc.excerpt && (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {doc.excerpt}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {doc.projectName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {results.length > 0 && (
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
        </>
      )}
    </div>
  );
}
