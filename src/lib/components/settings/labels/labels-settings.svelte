<!--
  Settings › Labels: search, create, inline edit and delete. Labels come from
  useProjectData(); the label actions' wrappers refresh the page data (refreshesData),
  so the list refreshes itself after every change.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SearchIcon from '@lucide/svelte/icons/search';
  import TagIcon from '@lucide/svelte/icons/tag';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import type { ProjectLabel } from '@/lib/project-data-types';
  import DeleteLabelDialog from './delete-label-dialog.svelte';
  import LabelEditor from './label-editor.svelte';
  import LabelRow from './label-row.svelte';

  let {
    projectId,
    counts,
    canEdit,
  }: {
    projectId: string;
    /** Active issues per label id. */
    counts: Record<string, number>;
    canEdit: boolean;
  } = $props();

  const data = useProjectData();
  const labels = $derived(data.labels);
  let query = $state('');
  let editing = $state<string | null>(null);
  let adding = $state(false);
  let deleting = $state<ProjectLabel | null>(null);

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter(
      (label) =>
        label.name.toLowerCase().includes(q) || label.description?.toLowerCase().includes(q),
    );
  });
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-2">
    <div class="relative flex-1">
      <SearchIcon
        class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        bind:value={query}
        placeholder={m.settings_labels_filter_placeholder()}
        aria-label={m.settings_labels_filter()}
        class="pl-8"
      />
    </div>
    {#if canEdit}
      <Button
        onclick={() => {
          editing = null;
          adding = true;
        }}
      >
        <PlusIcon />
        {m.settings_labels_new()}
      </Button>
    {/if}
  </div>

  {#snippet newLabelAction()}
    <Button variant="outline" onclick={() => (adding = true)}>
      <PlusIcon />
      {m.settings_labels_new()}
    </Button>
  {/snippet}

  {#if labels.length === 0 && !adding}
    <EmptyState
      title={m.settings_labels_none()}
      description={m.settings_labels_none_hint()}
      action={canEdit ? newLabelAction : undefined}
    >
      {#snippet icon()}<TagIcon />{/snippet}
    </EmptyState>
  {:else}
    <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
      {#if adding}
        <LabelEditor {projectId} onDone={() => (adding = false)} />
      {/if}
      {#each visible as label (label.id)}
        {#if editing === label.id}
          <LabelEditor {projectId} {label} onDone={() => (editing = null)} />
        {:else}
          <LabelRow
            {label}
            count={counts[label.id] ?? 0}
            {canEdit}
            onEdit={() => {
              adding = false;
              editing = label.id;
            }}
            onDelete={() => (deleting = label)}
          />
        {/if}
      {/each}
      {#if visible.length === 0 && labels.length > 0}
        <li class="px-3 py-6 text-center text-sm text-muted-foreground">
          {m.settings_labels_no_match({ query: query.trim() })}
        </li>
      {/if}
    </ul>
  {/if}

  {#if labels.length > 0}
    <p class="px-1 text-xs text-muted-foreground">
      {m.settings_labels_count({ count: labels.length })}
    </p>
  {/if}

  <DeleteLabelDialog
    {projectId}
    label={deleting}
    count={deleting ? (counts[deleting.id] ?? 0) : 0}
    onClose={() => (deleting = null)}
  />
</div>
