<script lang="ts">
  import { m } from '@/lib/i18n';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import type { ExternalFetchResult } from '@/lib/import/external';
  import { EXTERNAL_IMPORT_CAP } from '@/lib/import/records';
  import RecordPreview from './record-preview.svelte';

  let {
    fetched,
    noun,
    sourceName,
    includeCompleted,
    onImport,
  }: {
    fetched: ExternalFetchResult;
    noun: 'task' | 'story';
    sourceName: string;
    includeCompleted: boolean;
    onImport: () => void;
  } = $props();

  const count = $derived(fetched.records.length);
  const emptyTitle = $derived(noun === 'story' ? m.auth_import_empty_stories_title() : m.auth_import_empty_tasks_title());
  const emptyDescription = $derived(
    noun === 'story'
      ? includeCompleted
        ? m.auth_import_empty_stories({ source: sourceName })
        : m.auth_import_empty_open_stories({ source: sourceName })
      : includeCompleted
        ? m.auth_import_empty_tasks({ source: sourceName })
        : m.auth_import_empty_open_tasks({ source: sourceName }),
  );
  const stats = $derived(
    [
      m.auth_import_stat_open({ count: fetched.open }),
      ...(includeCompleted ? [m.auth_import_stat_completed({ count: fetched.closed })] : []),
      ...(fetched.children > 0 ? [m.auth_import_stat_children({ count: fetched.children })] : []),
      ...(fetched.truncated ? [m.auth_import_stat_capped({ count: EXTERNAL_IMPORT_CAP })] : []),
    ].join(' · '),
  );
</script>

{#if count === 0}
  <EmptyState title={emptyTitle} description={emptyDescription} />
{:else}
  <section class="flex flex-col gap-2">
    <h3 class="text-sm font-medium">
      {m.auth_import_preview()}{' '}
      <span class="font-normal text-muted-foreground">{stats}</span>
    </h3>
    <RecordPreview records={fetched.records} />
    <p class="text-xs text-muted-foreground">{m.auth_import_preview_note()}</p>
  </section>
  <div>
    <Button onclick={onImport}>
      {m.auth_import_button({ count })}
    </Button>
  </div>
{/if}
