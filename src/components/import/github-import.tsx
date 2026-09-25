'use client';

// GitHub Issues → issues: pick a repo (with the viewer's own GitHub token),
// fetch its issues (PRs excluded, capped), preview, import through the same
// chunked pipeline as CSV.

import { useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { GitBranch, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { fetchGitHubIssues, listGitHubRepos } from '@/app/actions/import';
import { projectHref } from '@/components/app-shell/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EmptyState, Skeleton } from '@/components/ui-icons';
import { GITHUB_IMPORT_CAP, type ImportRecord } from '@/lib/import/records';
import { ImportProgress, ImportResult, RecordPreview, useImportRunner } from './import-runner';

type RepoState =
  | { status: 'loading' }
  | { status: 'no-token' }
  | { status: 'ready'; repos: string[] };

interface Fetched {
  repo: string;
  records: ImportRecord[];
  open: number;
  closed: number;
  truncated: boolean;
}

export function GitHubImport({ projectId }: { projectId: string }) {
  const [repos, setRepos] = useState<RepoState>({ status: 'loading' });
  const [repo, setRepo] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [fetching, startFetch] = useTransition();
  const runner = useImportRunner(projectId);
  const repoId = useId();
  const closedId = useId();

  useEffect(() => {
    let alive = true;
    void listGitHubRepos(projectId).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setRepos({ status: 'ready', repos: res.repos });
        if (res.defaultRepo) setRepo((current) => current || res.defaultRepo!);
      } else if ('reason' in res && res.reason === 'no-token') {
        setRepos({ status: 'no-token' });
      } else {
        // Listing is a convenience — typing owner/name still works.
        setRepos({ status: 'ready', repos: [] });
        toast.error(res.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  function fetchIssues() {
    startFetch(async () => {
      const res = await fetchGitHubIssues({ projectId, repo, includeClosed });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setFetched({ repo: repo.trim(), ...res });
    });
  }

  if (runner.progress) return <ImportProgress {...runner.progress} />;
  if (runner.summary) {
    return (
      <ImportResult
        projectId={projectId}
        summary={runner.summary}
        onReset={() => {
          runner.reset();
          setFetched(null);
        }}
      />
    );
  }

  if (repos.status === 'loading') return <Skeleton className="h-24" variant="card" />;
  if (repos.status === 'no-token') {
    return (
      <EmptyState
        icon={<GitBranch />}
        title="Connect GitHub to import issues"
        description="Imports use your own GitHub account. Sign in with GitHub, or link your GitHub account in Settings → GitHub, then come back here."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href={projectHref(projectId, 'settings/github')}>Open GitHub settings</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor={repoId}>Repository</Label>
          <Input
            id={repoId}
            list={`${repoId}-list`}
            placeholder="owner/name"
            value={repo}
            autoComplete="off"
            onChange={(e) => {
              setRepo(e.target.value);
              setFetched(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && repo.trim() && !fetching) fetchIssues();
            }}
          />
          <datalist id={`${repoId}-list`}>
            {repos.repos.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div className="flex h-8 items-center gap-2">
          <Switch
            id={closedId}
            checked={includeClosed}
            onCheckedChange={(checked) => {
              setIncludeClosed(checked);
              setFetched(null);
            }}
          />
          <Label htmlFor={closedId} className="font-normal">
            Include closed issues
          </Label>
        </div>
        <Button variant="outline" disabled={!repo.trim() || fetching} onClick={fetchIssues}>
          {fetching && <Loader2 className="animate-spin" />}
          Fetch issues
        </Button>
      </div>

      {fetched &&
        (fetched.records.length === 0 ? (
          <EmptyState
            title="No issues to import"
            description={`${fetched.repo} has no ${includeClosed ? '' : 'open '}issues (pull requests are skipped).`}
          />
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                Preview{' '}
                <span className="font-normal text-muted-foreground">
                  {fetched.open} open{includeClosed && ` · ${fetched.closed} closed`}
                  {fetched.truncated && ` · capped at the first ${GITHUB_IMPORT_CAP}`}
                </span>
              </h3>
              <RecordPreview records={fetched.records} />
              <p className="text-xs text-muted-foreground">
                Open issues land in the default state, closed ones in the first completed state.
                Labels are created with their GitHub colours; each issue links back to GitHub, and
                issues imported before are skipped.
              </p>
            </section>
            <div>
              <Button onClick={() => void runner.run(fetched.records)}>
                Import {fetched.records.length} issue{fetched.records.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        ))}
    </div>
  );
}
