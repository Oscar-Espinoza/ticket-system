'use client';

// Asana → issues: personal access token → workspace → project → fetch tasks
// (subtasks follow their parent) → preview → the shared chunked import.

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  fetchAsanaTasksAction,
  listAsanaProjectsAction,
  listAsanaWorkspacesAction,
} from '@/app/actions/import';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AsanaOption } from '@/lib/import/asana';
import type { ExternalFetchResult } from '@/lib/import/external';
import { FetchedPreview, IncludeCompleted, TokenForm } from './external-import';
import { ImportProgress, ImportResult, useImportRunner } from './import-runner';

export function AsanaImport({ projectId }: { projectId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<AsanaOption[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [projects, setProjects] = useState<AsanaOption[] | null>(null);
  const [project, setProject] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [fetched, setFetched] = useState<ExternalFetchResult | null>(null);
  const [pending, startTransition] = useTransition();
  const runner = useImportRunner(projectId);

  const loadProjects = (value: string, withToken: string) => {
    setWorkspace(value);
    setProjects(null);
    setProject('');
    setFetched(null);
    startTransition(async () => {
      const res = await listAsanaProjectsAction({ projectId, token: withToken, workspace: value });
      if (res.ok) setProjects(res.projects);
      else toast.error(res.error);
    });
  };

  const connect = (value: string) =>
    startTransition(async () => {
      const res = await listAsanaWorkspacesAction({ projectId, token: value });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setToken(value);
      setWorkspaces(res.workspaces);
      if (res.workspaces.length === 1) loadProjects(res.workspaces[0].gid, value);
    });

  const fetchTasks = () =>
    startTransition(async () => {
      if (!token) return;
      const res = await fetchAsanaTasksAction({ projectId, token, project, includeCompleted });
      if (res.ok) setFetched(res);
      else toast.error(res.error);
    });

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

  if (!token) {
    return (
      <TokenForm
        provider="Asana"
        pending={pending}
        onSubmit={connect}
        help={
          <>
            Create one in Asana under{' '}
            <a
              href="https://app.asana.com/0/my-apps"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              My settings → Apps → Developer apps
            </a>
            .
          </>
        }
      />
    );
  }

  const projectName = projects?.find((p) => p.gid === project)?.name ?? 'This project';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-48 flex-col gap-1.5">
          <Label>Workspace</Label>
          <Select value={workspace} onValueChange={(value) => loadProjects(value, token)} disabled={pending}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Pick a workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.gid} value={w.gid}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-48 flex-col gap-1.5">
          <Label>Project</Label>
          <Select
            value={project}
            onValueChange={(value) => {
              setProject(value);
              setFetched(null);
            }}
            disabled={pending || !projects?.length}
          >
            <SelectTrigger className="w-64">
              <SelectValue
                placeholder={!workspace ? 'Pick a workspace first' : projects === null ? 'Loading…' : projects.length ? 'Pick a project' : 'No projects'}
              />
            </SelectTrigger>
            <SelectContent>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.gid} value={p.gid}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <IncludeCompleted
          checked={includeCompleted}
          onChange={(checked) => {
            setIncludeCompleted(checked);
            setFetched(null);
          }}
          disabled={pending}
        />
        <Button variant="outline" disabled={!project || pending} onClick={fetchTasks}>
          {pending && <Loader2 className="animate-spin" />}
          Fetch tasks
        </Button>
      </div>
      {fetched && (
        <FetchedPreview
          fetched={fetched}
          noun="task"
          sourceName={projectName}
          includeCompleted={includeCompleted}
          onImport={() => void runner.run(fetched.records)}
        />
      )}
    </div>
  );
}
