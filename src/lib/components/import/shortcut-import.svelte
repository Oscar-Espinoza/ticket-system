<!--
  Shortcut → issues: API token → workflow or project → fetch stories (sub-task
  stories follow their parent) → preview → the shared chunked import.
-->
<script module lang="ts">
  /** Select values: `workflow:<id>` / `project:<id>`. */
  function parseSource(value: string): { kind: 'workflow' | 'project'; id: number } | null {
    const [kind, id] = value.split(':');
    return (kind === 'workflow' || kind === 'project') && Number(id) > 0
      ? { kind, id: Number(id) }
      : null;
  }
</script>

<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { fetchShortcutStoriesAction, listShortcutSourcesAction } from '@/lib/actions/import';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import type { ExternalFetchResult } from '@/lib/import/external';
  import type { ShortcutOption } from '@/lib/import/shortcut';
  import FetchedPreview from './fetched-preview.svelte';
  import ImportProgress from './import-progress.svelte';
  import ImportResult from './import-result.svelte';
  import { useImportRunner } from './import-runner.svelte';
  import IncludeCompleted from './include-completed.svelte';
  import TokenForm from './token-form.svelte';

  type Sources = { workflows: ShortcutOption[]; projects: ShortcutOption[] };

  let { projectId }: { projectId: string } = $props();

  let token = $state<string | null>(null);
  let sources = $state.raw<Sources>({ workflows: [], projects: [] });
  let source = $state('');
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

  const connect = (value: string) =>
    transition(async () => {
      const res = await listShortcutSourcesAction({ projectId, token: value });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      token = value;
      sources = { workflows: res.workflows, projects: res.projects };
      if (res.workflows.length === 1 && !res.projects.length) {
        source = `workflow:${res.workflows[0].id}`;
      }
    });

  const fetchStories = () =>
    transition(async () => {
      const parsedSource = parseSource(source);
      if (!token || !parsedSource) return;
      const res = await fetchShortcutStoriesAction({
        projectId,
        token,
        source: parsedSource,
        includeCompleted,
      });
      if (res.ok) fetched = res;
      else toast.error(res.error);
    });

  const parsed = $derived(parseSource(source));
  const sourceName = $derived(
    (parsed &&
      (parsed.kind === 'workflow' ? sources.workflows : sources.projects).find(
        (o) => o.id === parsed.id,
      )?.name) ||
      'This source',
  );
  const items = $derived([
    ...sources.workflows.map((w) => ({ value: `workflow:${w.id}`, label: w.name })),
    ...sources.projects.map((p) => ({ value: `project:${p.id}`, label: p.name })),
  ]);
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
  <TokenForm provider="Shortcut" {pending} onSubmit={connect}>
    {#snippet help()}
      Create an API token in Shortcut under
      <a
        href="https://app.shortcut.com/settings/account/api-tokens"
        target="_blank"
        rel="noreferrer"
        class="underline underline-offset-2"
      >
        Settings → Your account → API tokens
      </a>.
    {/snippet}
  </TokenForm>
{:else}
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex min-w-48 flex-col gap-1.5">
        <Label>Import from</Label>
        <Select
          bind:value={
            () => source,
            (value) => {
              source = value;
              fetched = null;
            }
          }
          {items}
          disabled={pending}
        >
          <SelectTrigger class="w-64">
            <SelectValue placeholder="Pick a workflow or project" />
          </SelectTrigger>
          <SelectContent>
            {#if sources.workflows.length > 0}
              <SelectGroup>
                <SelectLabel>Workflows</SelectLabel>
                {#each sources.workflows as w (w.id)}
                  <SelectItem value="workflow:{w.id}">
                    {w.name}
                  </SelectItem>
                {/each}
              </SelectGroup>
            {/if}
            {#if sources.projects.length > 0}
              <SelectGroup>
                <SelectLabel>Projects</SelectLabel>
                {#each sources.projects as p (p.id)}
                  <SelectItem value="project:{p.id}">
                    {p.name}
                  </SelectItem>
                {/each}
              </SelectGroup>
            {/if}
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
      <Button variant="outline" disabled={!parsed || pending} onclick={fetchStories}>
        {#if pending}<Loader2Icon class="animate-spin" />{/if}
        Fetch stories
      </Button>
    </div>
    {#if fetched}
      {@const result = fetched}
      <FetchedPreview
        fetched={result}
        noun="story"
        {sourceName}
        {includeCompleted}
        onImport={() => void runner.run(result.records)}
      />
    {/if}
  </div>
{/if}
