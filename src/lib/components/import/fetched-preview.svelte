<script lang="ts">
  import { pluralize } from '@/lib/format';
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
    /** "task" / "story" */
    noun: string;
    sourceName: string;
    includeCompleted: boolean;
    onImport: () => void;
  } = $props();

  const plural = $derived(noun === 'story' ? 'stories' : `${noun}s`);
  const count = $derived(fetched.records.length);
</script>

{#if count === 0}
  <EmptyState
    title="No {plural} to import"
    description="{sourceName} has no {includeCompleted ? '' : 'open '}{plural}."
  />
{:else}
  <section class="flex flex-col gap-2">
    <h3 class="text-sm font-medium">
      Preview{' '}
      <span class="font-normal text-muted-foreground">
        {fetched.open} open{includeCompleted ? ` · ${fetched.closed} completed` : ''}
        {fetched.children > 0 ? ` · ${fetched.children} as sub-issues` : ''}
        {fetched.truncated ? ` · capped at the first ${EXTERNAL_IMPORT_CAP}` : ''}
      </span>
    </h3>
    <RecordPreview records={fetched.records} />
    <p class="text-xs text-muted-foreground">
      Completed items land in the first completed state; others in the state with the same name when
      there is one, else the default. Assignees match members by email, tags become labels, and each
      issue links back to its source — items imported before are skipped.
    </p>
  </section>
  <div>
    <Button onclick={onImport}>
      Import {pluralize(count, 'issue')}
    </Button>
  </div>
{/if}
