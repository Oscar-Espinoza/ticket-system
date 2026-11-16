<!--
  GitHub Issues → issues: pick a repo (with the viewer's own GitHub token),
  fetch its issues (PRs excluded, capped), preview, import through the same
  chunked pipeline as CSV.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import GitBranchIcon from '@lucide/svelte/icons/git-branch';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import { fetchGitHubIssues, listGitHubRepos } from '@/lib/actions/import';
  import { EmptyState, Skeleton } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { GITHUB_IMPORT_CAP, type ImportRecord } from '@/lib/import/records';
  import ImportProgress from './import-progress.svelte';
  import ImportResult from './import-result.svelte';
  import { useImportRunner } from './import-runner.svelte';
  import RecordPreview from './record-preview.svelte';

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

  let { projectId }: { projectId: string } = $props();

  let repos = $state.raw<RepoState>({ status: 'loading' });
  let repo = $state('');
  let includeClosed = $state(false);
  let fetched = $state.raw<Fetched | null>(null);
  let fetching = $state(false);
  const runner = useImportRunner(() => projectId);
  const repoId = $props.id();
  const closedId = `${repoId}-closed`;

  $effect(() => {
    const id = projectId;
    let alive = true;
    void listGitHubRepos(id).then((res) => {
      if (!alive) return;
      if (res.ok) {
        repos = { status: 'ready', repos: res.repos };
        if (res.defaultRepo) repo = repo || res.defaultRepo;
      } else if ('reason' in res && res.reason === 'no-token') {
        repos = { status: 'no-token' };
      } else {
        // Listing is a convenience — typing owner/name still works.
        repos = { status: 'ready', repos: [] };
        toast.error(res.error);
      }
    });
    return () => {
      alive = false;
    };
  });

  async function fetchIssues() {
    fetching = true;
    try {
      const res = await fetchGitHubIssues({ projectId, repo, includeClosed });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      fetched = { repo: repo.trim(), ...res };
    } finally {
      fetching = false;
    }
  }
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
{:else if repos.status === 'loading'}
  <Skeleton class="h-24" variant="card" />
{:else if repos.status === 'no-token'}
  <EmptyState
    title={m.auth_import_connect_title()}
    description={m.auth_import_connect_description()}
  >
    {#snippet icon()}<GitBranchIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" href={projectHref(projectId, 'settings/github')}>
        {m.auth_import_open_github_settings()}
      </Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex min-w-64 flex-1 flex-col gap-1.5">
        <Label for={repoId}>{m.auth_import_repository()}</Label>
        <Input
          id={repoId}
          list="{repoId}-list"
          placeholder={m.auth_import_repo_placeholder()}
          bind:value={repo}
          autocomplete="off"
          oninput={() => (fetched = null)}
          onkeydown={(e) => {
            if (e.key === 'Enter' && repo.trim() && !fetching) void fetchIssues();
          }}
        />
        <datalist id="{repoId}-list">
          {#each repos.repos as r (r)}
            <option value={r}></option>
          {/each}
        </datalist>
      </div>
      <div class="flex h-8 items-center gap-2">
        <Switch
          id={closedId}
          bind:checked={
            () => includeClosed,
            (checked) => {
              includeClosed = checked;
              fetched = null;
            }
          }
        />
        <Label for={closedId} class="font-normal">{m.auth_import_include_closed()}</Label>
      </div>
      <Button variant="outline" disabled={!repo.trim() || fetching} onclick={fetchIssues}>
        {#if fetching}<Loader2Icon class="animate-spin" />{/if}
        {m.auth_import_fetch_issues()}
      </Button>
    </div>

    {#if fetched}
      {#if fetched.records.length === 0}
        <EmptyState
          title={m.auth_import_empty_issues_title()}
          description={includeClosed
            ? m.auth_import_empty_all_issues({ repo: fetched.repo })
            : m.auth_import_empty_open_issues({ repo: fetched.repo })}
        />
      {:else}
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-medium">
            {m.auth_import_preview()}{' '}
            <span class="font-normal text-muted-foreground">
              {[
                m.auth_import_stat_open({ count: fetched.open }),
                ...(includeClosed ? [m.auth_import_stat_closed({ count: fetched.closed })] : []),
                ...(fetched.truncated ? [m.auth_import_stat_capped({ count: GITHUB_IMPORT_CAP })] : []),
              ].join(' · ')}
            </span>
          </h3>
          <RecordPreview records={fetched.records} />
          <p class="text-xs text-muted-foreground">{m.auth_import_github_note()}</p>
        </section>
        <div>
          <Button onclick={() => fetched && void runner.run(fetched.records)}>
            {m.auth_import_button({ count: fetched.records.length })}
          </Button>
        </div>
      {/if}
    {/if}
  </div>
{/if}
