'use client';

// Shortcut → issues: API token → workflow or project → fetch stories (sub-task
// stories follow their parent) → preview → the shared chunked import.

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { fetchShortcutStoriesAction, listShortcutSourcesAction } from '@/app/actions/import';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExternalFetchResult } from '@/lib/import/external';
import type { ShortcutOption } from '@/lib/import/shortcut';
import { FetchedPreview, IncludeCompleted, TokenForm } from './external-import';
import { ImportProgress, ImportResult, useImportRunner } from './import-runner';

type Sources = { workflows: ShortcutOption[]; projects: ShortcutOption[] };

/** Select values: `workflow:<id>` / `project:<id>`. */
function parseSource(value: string): { kind: 'workflow' | 'project'; id: number } | null {
  const [kind, id] = value.split(':');
  return (kind === 'workflow' || kind === 'project') && Number(id) > 0 ? { kind, id: Number(id) } : null;
}

export function ShortcutImport({ projectId }: { projectId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [sources, setSources] = useState<Sources>({ workflows: [], projects: [] });
  const [source, setSource] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [fetched, setFetched] = useState<ExternalFetchResult | null>(null);
  const [pending, startTransition] = useTransition();
  const runner = useImportRunner(projectId);

  const connect = (value: string) =>
    startTransition(async () => {
      const res = await listShortcutSourcesAction({ projectId, token: value });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setToken(value);
      setSources({ workflows: res.workflows, projects: res.projects });
      if (res.workflows.length === 1 && !res.projects.length) setSource(`workflow:${res.workflows[0].id}`);
    });

  const fetchStories = () =>
    startTransition(async () => {
      const parsed = parseSource(source);
      if (!token || !parsed) return;
      const res = await fetchShortcutStoriesAction({ projectId, token, source: parsed, includeCompleted });
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
        provider="Shortcut"
        pending={pending}
        onSubmit={connect}
        help={
          <>
            Create an API token in Shortcut under{' '}
            <a
              href="https://app.shortcut.com/settings/account/api-tokens"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Settings → Your account → API tokens
            </a>
            .
          </>
        }
      />
    );
  }

  const parsed = parseSource(source);
  const sourceName =
    (parsed &&
      (parsed.kind === 'workflow' ? sources.workflows : sources.projects).find((o) => o.id === parsed.id)?.name) ||
    'This source';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-48 flex-col gap-1.5">
          <Label>Import from</Label>
          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value);
              setFetched(null);
            }}
            disabled={pending}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Pick a workflow or project" />
            </SelectTrigger>
            <SelectContent>
              {sources.workflows.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Workflows</SelectLabel>
                  {sources.workflows.map((w) => (
                    <SelectItem key={`w${w.id}`} value={`workflow:${w.id}`}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {sources.projects.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Projects</SelectLabel>
                  {sources.projects.map((p) => (
                    <SelectItem key={`p${p.id}`} value={`project:${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
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
        <Button variant="outline" disabled={!parsed || pending} onClick={fetchStories}>
          {pending && <Loader2 className="animate-spin" />}
          Fetch stories
        </Button>
      </div>
      {fetched && (
        <FetchedPreview
          fetched={fetched}
          noun="story"
          sourceName={sourceName}
          includeCompleted={includeCompleted}
          onImport={() => void runner.run(fetched.records)}
        />
      )}
    </div>
  );
}
