<!--
  Asana → issues: personal access token → workspace → project → fetch tasks
  (subtasks follow their parent) → preview → the shared chunked import.
-->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import {
    fetchAsanaTasksAction,
    listAsanaProjectsAction,
    listAsanaWorkspacesAction,
  } from '@/lib/actions/import';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import type { AsanaOption } from '@/lib/import/asana';
  import type { ExternalFetchResult } from '@/lib/import/external';
  import FetchedPreview from './fetched-preview.svelte';
  import ImportProgress from './import-progress.svelte';
  import ImportResult from './import-result.svelte';
  import { useImportRunner } from './import-runner.svelte';
  import IncludeCompleted from './include-completed.svelte';
  import TokenForm from './token-form.svelte';

  let { projectId }: { projectId: string } = $props();

  let token = $state<string | null>(null);
  let workspaces = $state.raw<AsanaOption[]>([]);
  let workspace = $state('');
  let projects = $state.raw<AsanaOption[] | null>(null);
  let project = $state('');
  let includeCompleted = $state(false);
  let fetched = $state.raw<ExternalFetchResult | null>(null);
  let inFlight = $state(0);
  const pending = $derived(inFlight > 0);
  const runner = useImportRunner(() => projectId);

  /** In-flight counter (stays true until every overlapping call finishes) around an awaited server call. */
  async function transition(fn: () => Promise<void>) {
    inFlight += 1;
    try {
      await fn();
    } finally {
      inFlight -= 1;
    }
  }

  const loadProjects = (value: string, withToken: string) => {
    workspace = value;
    projects = null;
    project = '';
    fetched = null;
    return transition(async () => {
      const res = await listAsanaProjectsAction({ projectId, token: withToken, workspace: value });
      if (res.ok) projects = res.projects;
      else toast.error(res.error);
    });
  };

  const connect = (value: string) =>
    transition(async () => {
      const res = await listAsanaWorkspacesAction({ projectId, token: value });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      token = value;
      workspaces = res.workspaces;
      if (res.workspaces.length === 1) void loadProjects(res.workspaces[0].gid, value);
    });

  const fetchTasks = () =>
    transition(async () => {
      if (!token) return;
      const res = await fetchAsanaTasksAction({ projectId, token, project, includeCompleted });
      if (res.ok) fetched = res;
      else toast.error(res.error);
    });

  const projectName = $derived(projects?.find((p) => p.gid === project)?.name ?? 'This project');
</script>

{#if runner.progress}
  <ImportProgress done={runner.progress.done} total={runner.progress.total} />
{:else if runner.summary}
  <ImportResult
    {projectId}
    summary={runner.summary}
    onReset={() => {
      runner.reset();
      fetched = null;
    }}
  />
{:else if !token}
  <TokenForm provider="Asana" {pending} onSubmit={connect}>
    {#snippet help()}
      Create one in Asana under
      <a
        href="https://app.asana.com/0/my-apps"
        target="_blank"
        rel="noreferrer"
        class="underline underline-offset-2"
      >
        My settings → Apps → Developer apps
      </a>.
    {/snippet}
  </TokenForm>
{:else}
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex min-w-48 flex-col gap-1.5">
        <Label>Workspace</Label>
        <Select
          bind:value={() => workspace, (value) => void loadProjects(value, token!)}
          items={workspaces.map((w) => ({ value: w.gid, label: w.name }))}
          disabled={pending}
        >
          <SelectTrigger class="w-56">
            <SelectValue placeholder="Pick a workspace" />
          </SelectTrigger>
          <SelectContent>
            {#each workspaces as w (w.gid)}
              <SelectItem value={w.gid}>
                {w.name}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>
      <div class="flex min-w-48 flex-col gap-1.5">
        <Label>Project</Label>
        <Select
          bind:value={
            () => project,
            (value) => {
              project = value;
              fetched = null;
            }
          }
          items={(projects ?? []).map((p) => ({ value: p.gid, label: p.name }))}
          disabled={pending || !projects?.length}
        >
          <SelectTrigger class="w-64">
            <SelectValue
              placeholder={!workspace
                ? 'Pick a workspace first'
                : projects === null
                  ? 'Loading…'
                  : projects.length
                    ? 'Pick a project'
                    : 'No projects'}
            />
          </SelectTrigger>
          <SelectContent>
            {#each projects ?? [] as p (p.gid)}
              <SelectItem value={p.gid}>
                {p.name}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>
      <IncludeCompleted
        checked={includeCompleted}
        onChange={(checked) => {
          includeCompleted = checked;
          fetched = null;
        }}
        disabled={pending}
      />
      <Button variant="outline" disabled={!project || pending} onclick={fetchTasks}>
        {#if pending}<Loader2Icon class="animate-spin" />{/if}
        Fetch tasks
      </Button>
    </div>
    {#if fetched}
      {@const result = fetched}
      <FetchedPreview
        fetched={result}
        noun="task"
        sourceName={projectName}
        {includeCompleted}
        onImport={() => void runner.run(result.records)}
      />
    {/if}
  </div>
{/if}
